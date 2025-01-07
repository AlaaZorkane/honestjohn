import {
  AccountRole,
  setTransactionMessageLifetimeUsingBlockhash,
  address,
  type IInstruction,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  appendTransactionMessageInstruction,
  setTransactionMessageFeePayerSigner,
  airdropFactory,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  devnet,
  generateKeyPairSigner,
  lamports,
  pipe,
  getSignatureFromTransaction,
  createAddressWithSeed,
  getU64Codec,
} from "@solana/web3.js";
import {
  getCreateAccountWithSeedInstruction,
  SYSTEM_PROGRAM_ADDRESS,
  isSystemError,
  getSystemErrorMessage,
} from "@solana-program/system";
import { createLogger, printHonestJohn } from "./utils.ts";

printHonestJohn();
const log = createLogger("honest");

const rpc = createSolanaRpc(devnet("http://localhost:8899"));
const rpcSubscriptions = createSolanaRpcSubscriptions(
  devnet("ws://localhost:8900"),
);
const sendAndConfirm = sendAndConfirmTransactionFactory({
  rpc,
  rpcSubscriptions,
});

const PINOCCIO_PROGRAM_ID = address(
  "pinF7d2a3wfBtq5cmys6nq8F8KCKVwd7EGdZxF51P6z",
);

const HONEST_JOHN = address("honEst1111111111111111111111111111111111111");
const signer = await generateKeyPairSigner();
const signerPk = signer.address;

log.info("signer: %s", signerPk);

// Airdrop
const airdrop = airdropFactory({ rpc, rpcSubscriptions });
const airdroptx = await airdrop({
  commitment: "confirmed",
  recipientAddress: signerPk,
  lamports: lamports(100_000_000_000n),
});
log.info("airdrop tx: %s", airdroptx);

// Create a transaction
const { value: latestBlockhash } = await rpc
  .getLatestBlockhash({
    commitment: "confirmed",
  })
  .send();
log.info("latestBlockhash: %s", latestBlockhash.blockhash);

const codec = getU64Codec();
// check excalidraw to know where 1293 came from
log.info("answer: %d", 1293);
const answer = codec.encode(1293) as Uint8Array;

const seed = "rating";
const space = 11n * 8n + 1n;
const pda = await createAddressWithSeed({
  baseAddress: signerPk,
  programAddress: PINOCCIO_PROGRAM_ID,
  seed,
});

log.info("pda: %s", pda);

const minPdaExempt = await rpc.getMinimumBalanceForRentExemption(space).send();

const createPdaInstruction = getCreateAccountWithSeedInstruction({
  base: signerPk,
  seed,
  space,
  newAccount: pda,
  amount: minPdaExempt,
  baseAccount: signer,
  payer: signer,
  programAddress: PINOCCIO_PROGRAM_ID,
});

/**
 * account[0] = program account
 * account[1] = honest john
 * account[2] = system program
 * account[3] = signer/receiver
 */
const pinoInstruction: IInstruction = {
  programAddress: PINOCCIO_PROGRAM_ID,
  data: answer,
  accounts: [
    {
      address: pda,
      role: AccountRole.WRITABLE,
    },
    {
      address: HONEST_JOHN,
      role: AccountRole.WRITABLE,
    },
    {
      address: address(SYSTEM_PROGRAM_ADDRESS),
      role: AccountRole.READONLY,
    },
    {
      address: signerPk,
      role: AccountRole.WRITABLE_SIGNER,
    },
  ],
};

const txMsg = pipe(
  createTransactionMessage({
    version: 0,
  }),
  (tx) => {
    log.info("[1] setting transaction fee payer signer");
    return setTransactionMessageFeePayerSigner(signer, tx);
  },
  (tx) => {
    log.info("[2] setting transaction lifetime using blockhash");
    return setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx);
  },
  (tx) => {
    log.info("[3] appending create pda instruction");
    return appendTransactionMessageInstruction(createPdaInstruction, tx);
  },
  (tx) => {
    log.info("[4] appending pinocchio instruction");
    return appendTransactionMessageInstruction(pinoInstruction, tx);
  },
);

const signedTx = await signTransactionMessageWithSigners(txMsg);

try {
  const tx = getSignatureFromTransaction(signedTx);
  log.info("pinocchio tx: %s", tx);
  await sendAndConfirm(signedTx, {
    commitment: "confirmed",
    skipPreflight: true,
  });
  log.info("done!");
} catch (error) {
  if (isSystemError(error, txMsg)) {
    const msg = getSystemErrorMessage(error.context.code);
    log.error(msg, "error:");
  } else {
    log.error(error, "unknown error:");
  }
}
