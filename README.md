# XFI Peggy

New Dfinance PegZone implementation.

Based on [Althea Peggy](https://github.com/cosmos/peggy/tree/althea-peggy).

## Requirements

- Nodejs ~10.16.2
- Truffle ~5.1.33
- Ganache-cli ~6.9.1 *(for testing)*

## Compiling

Configure `truffle-config.js` (see [configuration manual](http://truffleframework.com/docs/advanced/configuration)).

Compile contracts:

```bash
npm run compile
```

## Testing

Compile contracts:

```bash
npm run compile
```

Run tests:

```bash
npm test
```

## Migration

Copy and configure `.env`:

```bash
cp .env.example .env
```

Migrate contracts:

```bash
PEGGY=true truffle migrate
```

To deploy XFI mockup contract:

```bash
XFI_MOCK=true CREATOR_ADDRESS=... truffle migrate
```

To run migration for a specific network, make sure that the network is configured in your `truffle-config.js` and specify the `--network` option, like below:

```bash
truffle migrate --network live
```

## Send deposit transaction

Use private key from account deployed XFI.

Example:

```bash
PEGGY_CONTRACT=... XFI_CONTRACT=... PRIVATE_KEY=... node scripts/send.js wallet12yygs09pnyw8uz2x75w4a53fq80gx5xaek3r5m 10
```

## License

[MIT](./LICENSE)
