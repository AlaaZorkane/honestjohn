<h1 align="center">
  Honest John
</h1>

<p align="center">
  <img src="https://www.cornel1801.com/disney/Pinocchio-1940/Honest_John.jpg" alt="Honest John" width="200">
</p>

<p align="center">
  <i><span style="color: gray">Why on Earth would you want to be real when you can be... FAMOUS?</span></i>
</p>

## Trivia:
Honest John is a sly and deceitful fox who, despite his misleading name, manipulates pinocchio for personal gain by leading him away from school and into trouble, ultimately putting pinocchio in dangerous situations for his own financial gain.

## Overview
The Pinocchio challenge is a solana security challenge made by [Solandy](https://www.youtube.com/@Solandy) to find potential interns, it is a moderately hard challenge for a beginner because it deals with memory layout manipulation, raw pointer arithmetic and a bit of Solana's internal raw account layout.

If you didn't solve it yet, I highly advice you to go watch the original Solandy video for extra background on the challenge [here](https://www.youtube.com/watch?v=QrIhST0s6qg).

## Program Logic
The program allows users to:
1. Rate something from 0-10
2. Tracks ratings in a program-owned account (not strictly speaking a PDA)
3. Claims to verify signer authority with a hardcoded authority check
4. Has special behavior when a specific authority pubkey matches

## Vulnerability: Memory Layout Manipulation

### Memory Layout of Accounts
```
AccountInfo Memory Layout:
[Account Struct (88 bytes)][Account Data...]
Where Account Struct is:
0x00: borrow_state    (u8)
0x01: is_signer       (u8)  <- Target field
0x02: is_writable     (u8)
0x03: executable      (u8)
0x04: original_data_len (u32)
0x08: key            (Pubkey, 32 bytes)
0x28: owner          (Pubkey, 32 bytes)
0x48: lamports       (u64)
0x50: data_len       (u64)
```

### The Attack Vector

The vulnerability exists in these key components:

1. The program does an unsafe (no bounds checking) pointer manipulation
2. The program allows arbitrary rating values that control pointer arithmetic
3. We can calculate the exact offset needed to manipulate memory

### Memory Visualization
```
Program Account:      [Account Struct][0x42][Rating Data (u64 array)]
                                     ^      ^
                                     |      |
                                   data   rating_pointer + rating offset

Signer Account:      [Account Struct][Data...]
                            ^
                            |
                         is_signer
```

## The Exploit

1. First, get the data pointers:
```rust
let signer_data_pointer = signer.borrow_mut_data_unchecked() as *mut [u8] as *mut u8;
let program_account_data_pointer = program_account.borrow_mut_data_unchecked() as *mut [u8] as *mut u8;
```

2. Calculate memory offset between program account's rating array and signer's is_signer field:
```rust
let program_account_data_pointer_rating = (program_account_data_pointer as *mut u64).add(1);
let signer_is_signer_pointer = signer_data_pointer.sub(87); // Account size - 1 to reach is_signer
```

3. By passing the correct rating value, we can make the program write to the signer's is_signer field instead of the rating array, allowing us to bypass the signer check.

## The answer formula

$$\left\lceil\frac{\text{signer_data_ptr} - \text{program_data_ptr} - (program_data_len + discrimantor_offset) - account_struct_size - 1}{8}\right\rceil$$

## Notes

* You don't need to calculate the offset programmatically, you can calculate it manually by checking the memory layout of the accounts in the program.

* Since we are the ones creating the program account, we hard code its size to 11 * 8 + 1 bytes, but even if we didn't, we can still calculate it programmatically.

* The rating pointer is `*mut u64` and not `*mut u8`, this is why we need to divide the calculated u8 offset by 8 to get the correct u64 offset. (as done in `line 71`).
