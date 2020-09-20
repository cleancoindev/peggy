// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract XFIToken is ERC20 {
    constructor () public ERC20('XFI', 'XFI') {
        _mint(msg.sender, 1e26);
    }
}
