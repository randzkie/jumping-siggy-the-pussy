const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  if (!deployer) {
    throw new Error('No deployer account available. Set DEPLOYER_PRIVATE_KEY in .env');
  }

  console.log(`Deploying PresenceRegistry with: ${deployer.address}`);

  const PresenceRegistry = await hre.ethers.getContractFactory('PresenceRegistry');
  const contract = await PresenceRegistry.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`PresenceRegistry deployed at: ${address}`);
  console.log('Set this in your .env as VITE_PRESENCE_CONTRACT_ADDRESS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
