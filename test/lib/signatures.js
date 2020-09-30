'use strict';

const { toStr } = require("./helpers");
const Web3 = require("web3");

const web3 = new Web3();

const CHECKPOINT_METHOD = Buffer.from(web3.utils.keccak256('checkpoint').slice(2), 'hex');
const WITHDRAW_METHOD = Buffer.from(web3.utils.keccak256('withdraw').slice(2), 'hex')

function makeWithdrawSignature(web3, id, amount, destination, peggyId, validator) {
    const toSign = web3.utils.keccak256(web3.eth.abi.encodeParameters(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [peggyId, WITHDRAW_METHOD, id, amount, destination]
    ));
    
    return web3.eth.accounts.sign(toSign, validator.account.privateKey);
 }
 
 function makeCheckpointSignature(web3, checkpoint, powerThreshold, validator) {
     const toSign = web3.utils.keccak256(web3.eth.abi.encodeParameters(['bytes32', 'uint256'], [checkpoint, powerThreshold]));
     return web3.eth.accounts.sign(toSign, validator.account.privateKey);
 }
 
 function makeCheckpoint(web3, validators, nonce, peggyId) {
     const valAddresses = validators.map(v => v.account.address);
     const valPowers = validators.map(v => toStr(v.power));
 
     return web3.utils.keccak256(web3.eth.abi.encodeParameters(
         ['bytes32', 'bytes32', 'uint256', 'address[]', 'uint256[]'], 
         [peggyId, CHECKPOINT_METHOD, nonce, valAddresses, valPowers]
     ))
 }

 module.exports = {
    makeWithdrawSignature,
    makeCheckpointSignature,
    makeCheckpoint
 }
