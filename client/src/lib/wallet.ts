// Wallet utilities for Multi-wallet integration (MetaMask, OKX, Rabby, etc.)

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  error: string | null;
}

export interface NetworkSwitchResult {
  success: boolean;
  action: 'switched' | 'added' | 'rejected' | 'error';
  error?: string;
}

export const RITUAL_NET_CHAIN_ID = 1979; // Ritual Chain ID (0x7BB)

export const RITUAL_CHAIN_CONFIG = {
  chainId: `0x${RITUAL_NET_CHAIN_ID.toString(16)}`,
  chainName: 'Ritual Chain',
  rpcUrls: ['https://rpc.ritualfoundation.org'],
  nativeCurrency: {
    name: 'RITUAL',
    symbol: 'RITUAL',
    decimals: 18,
  },
  blockExplorerUrls: ['https://explorer.ritualfoundation.org'],
};

// Get the available Ethereum provider
export const getProvider = () => {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  return win.okxwallet?.ethereum || win.rabby || win.ethereum || null;
};

// Check if any EVM wallet is available
export const isWalletAvailable = (): boolean => {
  return getProvider() !== null;
};

// Switch wallet to Ritual Chain, adding it first if not present
export const switchToRitualChain = async (): Promise<NetworkSwitchResult> => {
  const ethereum = getProvider();
  if (!ethereum) {
    return { success: false, action: 'error', error: 'No wallet detected.' };
  }

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: RITUAL_CHAIN_CONFIG.chainId }],
    });
    return { success: true, action: 'switched' };
  } catch (switchError: any) {
    // 4902 = chain not added to wallet yet
    if (switchError.code === 4902 || switchError.code === -32603) {
      try {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [RITUAL_CHAIN_CONFIG],
        });
        return { success: true, action: 'added' };
      } catch (addError: any) {
        if (addError.code === 4001) {
          return { success: false, action: 'rejected', error: 'User rejected adding Ritual Chain.' };
        }
        return { success: false, action: 'error', error: addError.message || 'Failed to add Ritual Chain.' };
      }
    }

    if (switchError.code === 4001) {
      return { success: false, action: 'rejected', error: 'User rejected network switch.' };
    }

    return { success: false, action: 'error', error: switchError.message || 'Failed to switch network.' };
  }
};

// Connect wallet (just get accounts — network switch is handled separately via banner)
export const connectWallet = async (): Promise<WalletState> => {
  try {
    const ethereum = getProvider();
    if (!ethereum) {
      return {
        isConnected: false,
        address: null,
        chainId: null,
        error: 'No EVM wallet (MetaMask, OKX, Rabby) detected.',
      };
    }

    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    const address = accounts[0];

    const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);

    return {
      isConnected: true,
      address,
      chainId,
      error: null,
    };
  } catch (error: any) {
    return {
      isConnected: false,
      address: null,
      chainId: null,
      error: error.message || 'Failed to connect wallet',
    };
  }
};

// Get current wallet state without prompting
export const getWalletState = async (): Promise<WalletState> => {
  try {
    const ethereum = getProvider();
    if (!ethereum) {
      return { isConnected: false, address: null, chainId: null, error: null };
    }

    const accounts = await ethereum.request({ method: 'eth_accounts' });
    if (accounts.length === 0) {
      return { isConnected: false, address: null, chainId: null, error: null };
    }

    const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);

    return { isConnected: true, address: accounts[0], chainId, error: null };
  } catch (error: any) {
    return { isConnected: false, address: null, chainId: null, error: error.message };
  }
};

// Disconnect wallet
export const disconnectWallet = async (): Promise<WalletState> => {
  try {
    const ethereum = getProvider();
    if (ethereum) {
      try {
        await ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Not all wallets support this — ignore
      }
    }
    return { isConnected: false, address: null, chainId: null, error: null };
  } catch (error: any) {
    return { isConnected: false, address: null, chainId: null, error: error?.message || 'Failed to disconnect wallet' };
  }
};

// Format address for display
export const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};
