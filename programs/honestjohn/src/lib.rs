use std::ops::Div;

use pinocchio::{
    account_info::AccountInfo, entrypoint, msg, program_error::ProgramError, pubkey::Pubkey,
    ProgramResult,
};
use pinocchio_pubkey::{declare_id, from_str};
use pinocchio_system::instructions::Transfer;
const DESCRIMINATOR: u8 = 0x42;

declare_id!("pinF7d2a3wfBtq5cmys6nq8F8KCKVwd7EGdZxF51P6z");
entrypoint!(process_instruction);

// ADDED FROM ORIGINAL CHALLENGE
// pub(crate) struct Account {
//     pub(crate) borrow_state: u8,  // offset 0
//     is_signer: u8,                // offset 1 (this is where we want to get to)
//     is_writable: u8,              // offset 2
//     executable: u8,               // offset 3
//     original_data_len: u32,       // offset 4
//     key: Pubkey,                  // offset 8
//     owner: Pubkey,                // offset 40
//     lamports: u64,                // offset 72
//     data_len: u64,                // offset 80
// }
const ACCOUNT_STRUCT_SIZE: usize = 88;
const IS_SIGNER_OFFSET: usize = ACCOUNT_STRUCT_SIZE - 1;

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let rating = u64::from_le_bytes(instruction_data[0..8].try_into().unwrap());
    msg!("You rated {}/10!", rating);

    if accounts.len() < 3 {
        return Err(ProgramError::InvalidArgument);
    }

    let program_account = &accounts[0];
    if !program_account.owner().eq(program_id) {
        return Err(ProgramError::IllegalOwner);
    }
    if program_account.data_len() < 11 * 8 + 1 {
        return Err(ProgramError::InvalidAccountData);
    }

    let signer = &accounts[1];

    // ADDED FROM ORIGINAL CHALLENGE
    unsafe {
        let signer_data_pointer = signer.borrow_mut_data_unchecked() as *mut [u8] as *mut u8;

        let signer_is_signer_pointer = signer_data_pointer.sub(IS_SIGNER_OFFSET);
        msg!("is_signer_pointer (addr): {:?}", signer_is_signer_pointer);

        let program_account_data_pointer =
            program_account.borrow_mut_data_unchecked() as *mut [u8] as *mut u8;
        let program_account_is_signer_pointer = program_account_data_pointer.sub(IS_SIGNER_OFFSET);
        msg!(
            "program_account_is_signer_pointer (addr): {:?}",
            program_account_is_signer_pointer
        );
        let program_account_data_pointer_rating = (program_account_data_pointer as *mut u64).add(1);

        // minus 8 because rating pointer has .add(1) as mut u64
        let calculated_offset =
            signer_is_signer_pointer.offset_from(program_account_data_pointer_rating as *mut u8);
        msg!("calculated_offset (*mut u8): {:?}", calculated_offset);
        let calculated_offset_u64 = (calculated_offset as f64).div(8.0).ceil() as usize;
        msg!("calculated_offset (*mut u64): {:?}", calculated_offset_u64);
        msg!(
            "instruction data (answer): {:?}",
            calculated_offset_u64.to_le_bytes()
        );
    }

    unsafe {
        let data_pointer = program_account.borrow_mut_data_unchecked() as *mut [u8] as *mut u8;
        *data_pointer = DESCRIMINATOR;
        let rating_pointer = data_pointer.add(1) as *mut u64;
        *rating_pointer.add(rating as usize) += 1;
    }

    let system_program = &accounts[2];

    if !signer.is_signer() {
        return Err(ProgramError::IncorrectAuthority);
    }
    if !system_program.key().eq(&Pubkey::default()) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let authority = from_str("honEst1111111111111111111111111111111111111");
    if signer.key().eq(&authority) {
        // this is where you want to get to
        msg!("Why on Earth would you want to be real when you can be... FAMOUS?");

        let lamports = program_account.lamports();
        *program_account.try_borrow_mut_lamports().unwrap() = 0;

        if accounts.len() >= 4 {
            let receiver = &accounts[3];
            *receiver.try_borrow_mut_lamports().unwrap() += lamports;
        } else {
            *signer.try_borrow_mut_lamports().unwrap() += lamports;
        }
    } else {
        msg!("yoinked!");

        Transfer {
            from: signer,
            to: program_account,
            lamports: 100_000_000,
        }
        .invoke()?;
    }

    Ok(())
}
