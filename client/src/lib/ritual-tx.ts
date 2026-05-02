import { BrowserProvider, Contract, isAddress, JsonRpcProvider } from 'ethers';
import { RITUAL_NET_CHAIN_ID, getProvider } from './wallet';

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

const PRESENCE_CONTRACT_ABI = [
  'function recordPresence(uint256 score) external',
];

// Deployed on Ritual Chain (ID 1979). Env var takes precedence, hardcoded is fallback.
const PRESENCE_CONTRACT_ADDRESS =
  import.meta.env.VITE_PRESENCE_CONTRACT_ADDRESS ||
  '0x46637aa78c328edcc84ffc161b7b7e2545ee01a9';

const PUBLIC_RPC_URL = 'https://rpc.ritualfoundation.org';

export const submitProofOfPresence = async (_address: string, score: number = 0): Promise<TransactionResult> => {
  try {
    const ethereum = getProvider();
    if (!ethereum) {
      return {
        success: false,
        error: 'No wallet detected. Please install MetaMask, OKX, or Rabby.',
      };
    }

    if (!isAddress(PRESENCE_CONTRACT_ADDRESS)) {
      return {
        success: false,
        error: `Invalid contract address: ${PRESENCE_CONTRACT_ADDRESS}`,
      };
    }

    // Verify the wallet is on Ritual Chain
    const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);
    if (chainId !== RITUAL_NET_CHAIN_ID) {
      return {
        success: false,
        error: `Wrong network. Please switch to Ritual Chain (ID ${RITUAL_NET_CHAIN_ID}). Currently on chain ${chainId}.`,
      };
    }

    // Get signer directly — no address mismatch check needed
    const provider = new BrowserProvider(ethereum);
    const signer = await provider.getSigner();

    const contract = new Contract(PRESENCE_CONTRACT_ADDRESS, PRESENCE_CONTRACT_ABI, signer);

    // This call opens the wallet confirmation popup
    const tx = await contract.recordPresence(Math.max(0, Math.floor(score)));
    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('submitProofOfPresence error:', error);

    // User rejected the transaction in their wallet
    if (
      error.code === 'ACTION_REJECTED' ||
      error.code === 4001 ||
      error.message?.includes('user rejected') ||
      error.message?.includes('User denied') ||
      error.message?.includes('rejected')
    ) {
      return { success: false, error: 'Transaction cancelled by user.' };
    }

    if (error.message?.includes('insufficient funds')) {
      return { success: false, error: 'Insufficient RITUAL tokens for gas fees.' };
    }

    if (error.message?.includes('RPC') || error.message?.includes('coalesce') || error.message?.includes('too many errors')) {
      return { success: false, error: 'Ritual Network is busy. Please try again in a moment.' };
    }

    return {
      success: false,
      error: error.message || 'Transaction failed. Please try again.',
    };
  }
};

export const waitForTransaction = async (
  txHash: string,
  maxAttempts: number = 60
): Promise<boolean> => {
  try {
    const publicProvider = new JsonRpcProvider(PUBLIC_RPC_URL);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const receipt = await publicProvider.getTransactionReceipt(txHash);
        if (receipt) {
          return receipt.status === 1;
        }
      } catch (pollError) {
        console.warn('Polling error, retrying...', pollError);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return false;
  } catch (error) {
    console.error('waitForTransaction error:', error);
    return false;
  }
};
