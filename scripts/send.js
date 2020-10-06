/**
 * Transfer.
 *
 * @module scripts/send
 */
'use strict';

const path = require('path');

require('dotenv').config({path: path.resolve(__dirname, '..', '.env')});

const Web3     = require('web3');
const cosmos   = require('cosmos-lib');
const PeggyABI = require('build/contracts/Peggy.json').abi;
const ERC20ABI = require('build/contracts/ERC20.json').abi;

const WEB3_PROVIDER_URL = process.env.WEB3 || 'http://127.0.0.1:9545';

const web3 = new Web3(Web3.givenProvider || WEB3_PROVIDER_URL);

/**
 * Convert address to bech32.
 *
 * @param  {String} address
 * @return {Buffer}
 */
function addressToBytes(address) {
    return cosmos.address.getBytes32(address);
}

/**
 * Entrypoint.
 *
 * @return {Promise}
 */
(async function main() {
    if (!process.env.PEGGY_CONTRACT) {
        throw 'PEGGY_CONTRACT is missing';
    }

    if (!process.env.XFI_CONTRACT) {
        throw 'XFI_CONTRACT is missing';
    }

    if (!process.env.PRIVATE_KEY) {
        throw 'PRIVATE_KEY parameter missed';
    }

    let privateKey = process.env.PRIVATE_KEY;

    if (privateKey.indexOf('0x') != 0) {
        privateKey = '0x' + privateKey;
    }

    const sender = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(sender);
    web3.eth.defaultAccount = sender.address;

    console.log(`Sender address is ${sender.address}`);

    const peggy = new web3.eth.Contract(PeggyABI, process.env.PEGGY_CONTRACT);

    const xfiTokenAddr = process.env.XFI_CONTRACT;

    console.log(`Staking XFI token address is ${xfiTokenAddr}`);
    const xfiToken = new web3.eth.Contract(ERC20ABI, xfiTokenAddr);

    const args   = process.argv.slice(2);
    const dest   = args[0];
    const amount = args[1];

    console.log('Sending approve / deposit transaction: ' + dest + ' / ' + amount);

    let tx = await xfiToken.methods.approve(peggy.options.address, amount).send({
        from: sender.address,
        gas: 60000
    });

    console.log(`Approve tx hash is ${tx.transactionHash}`);

    tx = await peggy.methods.deposit(xfiTokenAddr, addressToBytes(dest), amount).send({
        from: sender.address,
        gas: 150000
    });

    console.log(`Deposit tx hash is ${tx.transactionHash}`);
})();
