// Just transfer some XFI to contract.
/**
 * Staking scripts.
 *
 * @module scripts/stake
 */

'use strict';

const Web3       = require('web3');
const PeggyABI = require('../build/contracts/Peggy.json').abi;
const ERC20ABI   = require('../build/contracts/ERC20.json').abi;
const cosmos     = require('cosmos-lib');

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
 * Stake.
 *
 * @param  {Object}  sender
 * @param  {Object}  xfiToken
 * @param  {Object}  staking
 * @param  {String}  amount
 * @param  {Buffer}  dfinanceAddr
 * @return {Promise}
 */
async function stake(sender, xfiToken, staking, amount, dfinanceAddr) {
    const xfiBalanceStr = await xfiToken.methods.balanceOf(sender.address).call();

    console.log(`Sender balance is ${xfiBalanceStr} wei XFI`);

    const xfiBalance = bigInt(xfiBalanceStr);

    if (xfiBalance.lt(amount)) {
        throw `Sender doesn't have enough XFI to stake ${amount} / ${xfiBalanceStr}`;
    }

    console.log('Sending ERC20 approve transaction');

    await xfiToken.methods.approve(staking.options.address, amount).send({
        from: sender.address,
        gas: 60000
    });

    console.log('Sending stake transaction');

    const tx = await staking.methods.stakeXFI('0x' + addressToBytes(dfinanceAddr).toString('hex'), amount).send({
        from: sender.address,
        gas: 150000
    });

    console.log(`Staking tx hash is ${tx.transactionHash}`);
}

/**
 * Increase stake.
 *
 * @param  {Object}  sender
 * @param  {Object}  xfiToken
 * @param  {Object}  staking
 * @param  {String}  amount
 * @return {Promise}
 */
async function addToStake(sender, xfiToken, staking, amount) {
    const xfiBalanceStr = await xfiToken.methods.balanceOf(sender.address).call();

    console.log(`Sender balance is ${xfiBalanceStr} wei XFI`);

    const xfiBalance = bigInt(xfiBalanceStr);

    if (xfiBalance.lt(amount)) {
        throw `Sender doesn't have enough XFI to stake ${amount} / ${xfiBalanceStr}`;
    }

    console.log('Sending ERC20 approve transaction');

    await xfiToken.methods.approve(staking.options.address, amount).send({
        from: sender.address,
        gas: 60000
    });

    console.log('Sending add to stake transaction');

    const tx = await staking.methods.addXFI(amount).send({
        from: sender.address,
        gas: 150000
    });

    console.log(`Add to stake tx hash is ${tx.transactionHash}`);
}

/**
 * Unstake.
 *
 * @param  {Object} sender
 * @param  {Object} staking
 * @return {Promise}
 */
async function unstake(sender, staking) {
    const tx = await staking.methods.unstakeXFI().send({
        from: sender.address,
        gas: 150000
    });

    console.log(`Unstake tx hash is ${tx.transactionHash}`);
}

/**
 * Transfer tokens.
 *
 * @param  {Object}  sender
 * @param  {Object}  xfiToken
 * @param  {String}  recipientAddr
 * @param  {String}  amount
 * @return {Promise}
 */
async function send(sender, xfiToken, recipientAddr, amount) {
    const tx = await xfiToken.methods.transfer(recipientAddr, amount).send({
        from: sender.address,
        gas: 60000
    });

    console.log(`Send tx hash is ${tx.transactionHash}`);
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


    //    function deposit(address _erc20, bytes32 _destination, uint256 _amount) public {
    const args = process.argv.slice(2);
    const dest = args[0];
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
