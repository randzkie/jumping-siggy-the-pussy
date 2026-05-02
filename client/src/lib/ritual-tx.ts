import { BrowserProvider, Contract, isAddress, JsonRpcProvider } from 'ethers';
import { RITUAL_NET_CHAIN_ID, getProvider } from './wallet';

// Ritual Net transaction utilities for proof-of-presence

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

const PRESENCE_CONTRACT_ABI = [
  'function recordPresence(uint256 score) external',
];

const PRESENCE_CONTRACT_ADDRESS = import.meta.env.VITE_PRESENCE_CONTRACT_ADDRESS;
const PUBLIC_RPC_URL = 'https://rpc.ritualfoundation.org';

// Helper to get a robust provider (tries browser first, falls back to public RPC for reads)
const getRobustProvider = async () => {
  const ethereum = getProvider();
  if (ethereum) {
    return new BrowserProvider(ethereum);
  }
  return new JsonRpcProvider(PUBLIC_RPC_URL);
};

// Submit proof-of-presence transaction on Ritual Net
export const submitProofOfPresence = async (address: string, score: number = 0): Promise<TransactionResult> => {
  try {
    const ethereum = getProvider();
    if (!ethereum) {
      return {
        success: false,
        error: 'No wallet detected. Please install MetaMask, OKX, or Rabby.',
      };
    }
    
    if (!PRESENCE_CONTRACT_ADDRESS) {
      return {
        success: false,
        error: 'Contract address is missing. Please check your configuration.',
      };
    }
    
    if (!isAddress(PRESENCE_CONTRACT_ADDRESS)) {
      return {
        success: false,
        error: 'Invalid contract address configuration.',
      };
    }

    const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);
    if (chainId !== RITUAL_NET_CHAIN_ID) {
      return {
        success: false,
        error: 'Please switch your wallet to Ritual Net.',
      };
    }

    const provider = new BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    const signerAddress = await signer.getAddress();
    
    if (signerAddress.toLowerCase() !== address.toLowerCase()) {
      return {
        success: false,
        error: 'Connected wallet address mismatch. Please reconnect.',
      };
    }

    const contract = new Contract(PRESENCE_CONTRACT_ADDRESS, PRESENCE_CONTRACT_ABI, signer);
    
    // Attempt transaction with gas estimation to catch issues early
    try {
      const tx = await contract.recordPresence(Math.max(0, Math.floor(score)));
      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (txError: any) {
      console.error('Transaction error:', txError);
      if (txError.message?.includes('user rejected')) {
        return { success: false, error: 'Transaction rejected by user.' };
      }
      if (txError.message?.includes('insufficient funds')) {
        return { success: false, error: 'Insufficient RITUAL for gas.' };
      }
      throw txError; // Re-throw for general error handler
    }
  } catch (error: any) {
    console.error('Submission error:', error);
    let errorMsg = error.message || 'Transaction failed';
    
    if (errorMsg.includes('RPC') || errorMsg.includes('coalesce') || errorMsg.includes('too many errors')) {
      errorMsg = 'Ritual Net is currently busy or unstable. Retrying might help, or please try again in a few minutes.';
    }
    
    return {
      success: false,
      error: errorMsg,
    };
  }
};

// Wait for transaction confirmation with improved polling and fallback
export const waitForTransaction = async (
  txHash: string,
  maxAttempts: number = 60 // Increased to 2 minutes total
): Promise<boolean> => {
  try {
    // Try to use public RPC for polling if browser provider is unstable
    const publicProvider = new JsonRpcProvider(PUBLIC_RPC_URL);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const receipt = await publicProvider.getTransactionReceipt(txHash);
        if (receipt) {
          return receipt.status === 1;
        }
      } catch (pollError) {
        console.warn('Polling error, will retry...', pollError);
      }

      // Wait 2 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return false;
  } catch (error) {
    console.error('Wait for transaction error:', error);
    return false;
  }
};
