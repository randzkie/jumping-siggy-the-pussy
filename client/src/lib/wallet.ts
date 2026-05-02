// Wallet utilities for Multi-wallet integration (MetaMask, OKX, Rabby, etc.)

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  error: string | null;
}

export const RITUAL_NET_CHAIN_ID = 696; // Ritual Net chain ID

// Get the available Ethereum provider
export const getProvider = () => {
  if (typeof window === 'undefined') return null;

  const win = window as any;
  // Detect provider in order of preference
  return win.okxwallet?.ethereum || win.rabby || win.ethereum || null;
};

// Check if any EVM wallet is available
export const isWalletAvailable = (): boolean => {
  return getProvider() !== null;
};

// Connect wallet
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

    // Request account access
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    const address = accounts[0];

    // Get chain ID
    const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);

    // Check if on Ritual Net
    if (chainId !== RITUAL_NET_CHAIN_ID) {
      try {
        // Try to switch to Ritual Net
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${RITUAL_NET_CHAIN_ID.toString(16)}` }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          // Chain not added, try to add it
          try {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: `0x${RITUAL_NET_CHAIN_ID.toString(16)}`,
                  chainName: 'Ritual Net',
                  rpcUrls: ['https://rpc.ritualnet.io'],
                  nativeCurrency: {
                    name: 'RITUAL',
                    symbol: 'RITUAL',
                    decimals: 18,
                  },
                  blockExplorerUrls: ['https://explorer.ritualfoundation.org'],
                },
              ],
            });
          } catch (addError) {
            return {
              isConnected: false,
              address: null,
              chainId: null,
              error: 'Failed to add Ritual Net to your wallet.',
            };
          }
        } else {
          return {
            isConnected: false,
            address: null,
            chainId: null,
            error: 'Failed to switch to Ritual Net. Please switch manually.',
          };
        }
      }
    }

    // Re-verify chain ID after switch attempt
    const finalChainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const finalChainId = parseInt(finalChainIdHex, 16);
    if (finalChainId !== RITUAL_NET_CHAIN_ID) {
      return {
        isConnected: false,
        address: null,
        chainId: null,
        error: 'Please switch to Ritual Net to continue.',
      };
    }

    return {
      isConnected: true,
      address,
      chainId: RITUAL_NET_CHAIN_ID,
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

// Get current wallet state
export const getWalletState = async (): Promise<WalletState> => {
  try {
    const ethereum = getProvider();
    if (!ethereum) {
      return {
        isConnected: false,
        address: null,
        chainId: null,
        error: null,
      };
    }

    const accounts = await ethereum.request({ method: 'eth_accounts' });

    if (accounts.length === 0) {
      return {
        isConnected: false,
        address: null,
        chainId: null,
        error: null,
      };
    }

    const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);

    return {
      isConnected: true,
      address: accounts[0],
      chainId,
      error: null,
    };
  } catch (error: any) {
    return {
      isConnected: false,
      address: null,
      chainId: null,
      error: error.message,
    };
  }
};

// Disconnect wallet
export const disconnectWallet = async (): Promise<WalletState> => {
  try {
    const ethereum = getProvider();
    if (!ethereum) {
      return {
        isConnected: false,
        address: null,
        chainId: null,
        error: null,
      };
    }

    try {
      if (typeof ethereum?.request === 'function') {
        await ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        });
      }
    } catch {
      // Ignore provider-specific revoke failures.
    }

    return {
      isConnected: false,
      address: null,
      chainId: null,
      error: null,
    };
  } catch (error: any) {
    return {
      isConnected: false,
      address: null,
      chainId: null,
      error: error?.message || 'Failed to disconnect wallet',
    };
  }
};

// Format address for display
export const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};
