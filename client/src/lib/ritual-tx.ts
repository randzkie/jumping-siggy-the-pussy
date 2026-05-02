import { BrowserProvider, Contract, isAddress } from 'ethers';
import { RITUAL_NET_CHAIN_ID } from './wallet';

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

// Submit proof-of-presence transaction on Ritual Net
export const submitProofOfPresence = async (address: string, score: number = 0): Promise<TransactionResult> => {
  try {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      return {
        success: false,
        error: 'MetaMask not available',
      };
    }
    if (!PRESENCE_CONTRACT_ADDRESS) {
      return {
        success: false,
        error: 'VITE_PRESENCE_CONTRACT_ADDRESS is missing. Deploy the contract and set it in your env file.',
      };
    }
    if (!isAddress(PRESENCE_CONTRACT_ADDRESS)) {
      return {
        success: false,
        error: 'VITE_PRESENCE_CONTRACT_ADDRESS is invalid.',
      };
    }

    const ethereum = (window as any).ethereum;
    const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);
    if (1979 !== RITUAL_NET_CHAIN_ID) {
      return {
        success: false,
        error: 'Please switch MetaMask to Ritual Net before recording presence.',
      };
    }

    const provider = new BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    const signerAddress = await signer.getAddress();
    if (signerAddress.toLowerCase() !== address.toLowerCase()) {
      return {
        success: false,
        error: 'Connected wallet address changed. Reconnect wallet and try again.',
      };
    }

    const contract = new Contract(PRESENCE_CONTRACT_ADDRESS, PRESENCE_CONTRACT_ABI, signer);
    const tx = await contract.recordPresence(Math.max(0, Math.floor(score)));

    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Transaction failed',
    };
  }
};

// Wait for transaction confirmation
export const waitForTransaction = async (
  txHash: string,
  maxAttempts: number = 30
): Promise<boolean> => {
  try {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      return false;
    }

    const ethereum = (window as any).ethereum;

    for (let i = 0; i < maxAttempts; i++) {
      const receipt = await ethereum.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      });

      if (receipt) {
        return receipt.status === '0x1'; // 0x1 = success, 0x0 = failed
      }

      // Wait 2 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return false;
  } catch (error) {
    return false;
  }
};
