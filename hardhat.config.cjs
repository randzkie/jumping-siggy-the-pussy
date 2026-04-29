require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');

const { RITUAL_RPC_URL, DEPLOYER_PRIVATE_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    ritual: {
      url: RITUAL_RPC_URL || 'https://rpc.ritualnet.io',
      chainId: 696,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
