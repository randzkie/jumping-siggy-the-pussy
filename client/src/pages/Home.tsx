import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import { connectWallet, disconnectWallet, formatAddress, getProvider, getWalletState, isWalletAvailable, RITUAL_NET_CHAIN_ID, switchToRitualChain, type WalletState } from '@/lib/wallet';
import { submitProofOfPresence, waitForTransaction } from '@/lib/ritual-tx';

const SIGGY_RUNNING_FRAMES_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/siggy-running-clean-Pfsud86v8uhqjd7mJUA4ZQ.webp';
const SIGGY_CRAWLING_FRAMES_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/siggy-crawling-clean-4yjqakUBGzRCsQvhExHLkq.webp';
const TRASH_BIN_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/trash-bin-clean-bHj6Xke2nTHccozhFxf2eE.webp';
const DOG_OBSTACLE_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/dog-animated-UZMpqB5obhcUh85euvMMEF.webp';
const OVERHEAD_OBSTACLE_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/overhead-clean-ayPE6TiiVEZG5Fqv4TcrZy.webp';
// Rendered as a transparent-background "watermark" behind the game canvas.
const RITUAL_LOGO_URL = '/ritual-logo-bg.png';

interface GameState {
  isRunning: boolean;
  score: number;
  highScore: number;
  gameOver: boolean;
  walletConnected: boolean;
  tokenBalance: number;
  gamesPlayed: number;
}

type ObstacleType = 'trash' | 'dog' | 'overhead';
type StreetLitterType = 'bottle' | 'can' | 'paper' | 'bag' | 'cigarette';

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: ObstacleType;
  animationFrame?: number;
  animationCounter?: number;
  speedMultiplier?: number;
}

interface StreetLitter {
  x: number;
  y: number;
  type: StreetLitterType;
  size: number;
  rotation: number;
  opacity: number;
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
}

interface GameEngine {
  siggy: {
    x: number;
    y: number;
    width: number;
    height: number;
    velocityY: number;
    isJumping: boolean;
    isCrawling: boolean;
    gravity: number;
    jumpPower: number;
    animationFrame: number;
    animationCounter: number;
  };
  obstacles: Obstacle[];
  streetLitter: StreetLitter[];
  clouds: Cloud[];
  score: number;
  speed: number;
  spawnRate: number;
  gameActive: boolean;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const spritesRef = useRef<{
    siggyRunning: HTMLImageElement | null;
    siggyCrawling: HTMLImageElement | null;
    trashBin: HTMLImageElement | null;
    dog: HTMLImageElement | null;
    overhead: HTMLImageElement | null;
    ritualLogo: HTMLImageElement | null;
  }>({
    siggyRunning: null,
    siggyCrawling: null,
    trashBin: null,
    dog: null,
    overhead: null,
    ritualLogo: null,
  });

  const [gameState, setGameState] = useState<GameState>({
    isRunning: false,
    score: 0,
    highScore: typeof window !== 'undefined' ? parseInt(localStorage.getItem('siggy-highscore') || '0', 10) : 0,
    gameOver: false,
    walletConnected: false,
    tokenBalance: typeof window !== 'undefined' ? parseInt(localStorage.getItem('siggy-tokens') || '500', 10) : 500,
    gamesPlayed: 0,
  });

  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    address: null,
    chainId: null,
    error: null,
  });
  const [txStatus, setTxStatus] = useState<string>('');
  const [txLoading, setTxLoading] = useState(false);
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  const [networkSwitching, setNetworkSwitching] = useState(false);

  const chromaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chromaCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const transparentSpriteCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Load all sprites
  useEffect(() => {
    let loadCount = 0;
    const totalSprites = 6;
    transparentSpriteCacheRef.current.clear();

    const loadSprite = (url: string, key: keyof typeof spritesRef.current) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        spritesRef.current[key] = img;
        loadCount++;
        if (loadCount === totalSprites) {
          setSpritesLoaded(true);
        }
      };
      img.onerror = () => {
        console.error(`Failed to load sprite: ${url}`);
        loadCount++;
        if (loadCount === totalSprites) {
          setSpritesLoaded(true);
        }
      };
      img.src = url;
    };

    loadSprite(SIGGY_RUNNING_FRAMES_URL, 'siggyRunning');
    loadSprite(SIGGY_CRAWLING_FRAMES_URL, 'siggyCrawling');
    loadSprite(TRASH_BIN_URL, 'trashBin');
    loadSprite(DOG_OBSTACLE_URL, 'dog');
    loadSprite(OVERHEAD_OBSTACLE_URL, 'overhead');
    loadSprite(RITUAL_LOGO_URL, 'ritualLogo');
  }, []);

  // Check wallet state on mount and listen for chain/account changes
  useEffect(() => {
    const checkWallet = async () => {
      const state = await getWalletState();
      setWalletState(state);
      if (state.isConnected) {
        const storedTokens = parseInt(localStorage.getItem('siggy-tokens') || '0', 10);
        setGameState((prev) => ({ ...prev, walletConnected: true, tokenBalance: storedTokens }));
      } else {
        const storedTokens = parseInt(localStorage.getItem('siggy-tokens') || '500', 10);
        setGameState((prev) => ({ ...prev, walletConnected: false, tokenBalance: storedTokens || 500 }));
      }
    };
    checkWallet();

    // Listen for chain switches in the wallet
    const ethereum = getProvider();
    if (ethereum) {
      const onChainChanged = (chainIdHex: string) => {
        const chainId = parseInt(chainIdHex, 16);
        setWalletState((prev) => ({ ...prev, chainId }));
        setTxStatus('');
      };

      const onAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          // User disconnected from wallet side
          setWalletState({ isConnected: false, address: null, chainId: null, error: null });
          setGameState((prev) => ({ ...prev, walletConnected: false, tokenBalance: 500 }));
          localStorage.setItem('siggy-tokens', '500');
        } else {
          setWalletState((prev) => ({ ...prev, address: accounts[0] }));
        }
      };

      ethereum.on('chainChanged', onChainChanged);
      ethereum.on('accountsChanged', onAccountsChanged);
      return () => {
        ethereum.removeListener('chainChanged', onChainChanged);
        ethereum.removeListener('accountsChanged', onAccountsChanged);
      };
    }
  }, []);

  // Derived: is the wallet on Ritual Chain?
  const isOnCorrectChain = walletState.isConnected && walletState.chainId === RITUAL_NET_CHAIN_ID;

  // Handle wallet connection — don't force chain switch here; banner handles it
  const handleConnectWallet = async () => {
    const state = await connectWallet();
    setWalletState(state);

    if (state.isConnected) {
      localStorage.setItem('siggy-tokens', '0');
      setGameState((prev) => ({ ...prev, walletConnected: true, tokenBalance: 0 }));
    } else {
      setGameState((prev) => ({ ...prev, walletConnected: false }));
      if (state.error) setTxStatus(`Error: ${state.error}`);
    }
  };

  // Switch (or add) Ritual Chain in wallet
  const handleSwitchNetwork = async () => {
    setNetworkSwitching(true);
    setTxStatus('');
    const result = await switchToRitualChain();
    setNetworkSwitching(false);

    if (!result.success) {
      if (result.action === 'rejected') {
        setTxStatus('Network switch cancelled. Please switch to Ritual Chain to continue.');
      } else {
        setTxStatus(`Error: ${result.error}`);
      }
    }
    // On success the chainChanged event listener updates walletState.chainId automatically
  };

  // Handle wallet disconnection
  const handleDisconnectWallet = async () => {
    const state = await disconnectWallet();
    setWalletState(state);
    
    // Give back guest tokens when disconnecting
    localStorage.setItem('siggy-tokens', '500');
    setGameState((prev) => ({
      ...prev,
      walletConnected: false,
      tokenBalance: 500,
    }));
    
    setTxStatus('');
    setTxLoading(false);
  };

  // Submit proof-of-presence transaction
  const handleProofOfPresence = async () => {
    if (!walletState.address) return;

    // Guard: must be on Ritual Chain before submitting
    if (!isOnCorrectChain) {
      setTxStatus('Please switch to Ritual Chain first.');
      return;
    }

    setTxLoading(true);
    setTxStatus('Submitting proof-of-presence transaction...');

    try {
      const result = await submitProofOfPresence(walletState.address, gameState.highScore);

      if (result.success && result.txHash) {
        setTxStatus('Transaction submitted! Waiting for confirmation...');
        const confirmed = await waitForTransaction(result.txHash);

        if (confirmed) {
          // Add 500 tokens on successful blockchain recording
          const newTokenBalance = gameState.tokenBalance + 500;
          localStorage.setItem('siggy-tokens', newTokenBalance.toString());
          setGameState((prev) => ({
            ...prev,
            tokenBalance: newTokenBalance,
          }));
          setTxStatus('✓ Proof-of-presence recorded! +500 tokens added!');
          setTimeout(() => {
            setTxStatus('');
          }, 3000);
        } else {
          setTxStatus('Transaction pending or failed. Please check your wallet and try again.');
        }
      } else {
        // Handle specific error types
        const errorMsg = result.error || 'Unknown error';
        if (errorMsg.includes('RPC') || errorMsg.includes('network')) {
          setTxStatus('Network is busy. Please wait a moment and try again.');
        } else if (errorMsg.includes('user rejected') || errorMsg.includes('denied')) {
          setTxStatus('Transaction cancelled by user.');
        } else {
          setTxStatus(`Error: ${errorMsg}`);
        }
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      if (errorMsg.includes('RPC') || errorMsg.includes('network')) {
        setTxStatus('Network connection issue. Please check your connection and try again.');
      } else {
        setTxStatus(`Error: ${errorMsg}`);
      }
    } finally {
      setTxLoading(false);
    }
  };

  // Initialize game engine and loop
  useEffect(() => {
    if (!canvasRef.current || !spritesLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize game engine only once
    if (!gameEngineRef.current) {
      const initialSpawnDistance = 280 + Math.random() * 180;
      
      // Generate initial street litter (reduced amount)
      const initialLitter: StreetLitter[] = [];
      for (let i = 0; i < 6; i++) {
        initialLitter.push({
          x: Math.random() * canvas.width,
          y: canvas.height - 50 - Math.random() * 15,
          type: ['bottle', 'can', 'paper', 'bag', 'cigarette'][Math.floor(Math.random() * 5)] as StreetLitterType,
          size: 4 + Math.random() * 8,
          rotation: Math.random() * 360,
          opacity: 0.2 + Math.random() * 0.3, // More subtle
        });
      }

      // Generate initial clouds
      const initialClouds: Cloud[] = [];
      for (let i = 0; i < 4; i++) {
        initialClouds.push({
          x: Math.random() * canvas.width,
          y: 20 + Math.random() * 80,
          width: 40 + Math.random() * 60,
          speed: 0.2 + Math.random() * 0.3,
        });
      }

      gameEngineRef.current = {
        siggy: {
          x: 50,
          y: canvas.height - 100,
          width: 60,
          height: 60,
          velocityY: 0,
          isJumping: false,
          isCrawling: false,
          gravity: 0.6,
          jumpPower: -15,
          animationFrame: 0,
          animationCounter: 0,
        },
        obstacles: [],
        streetLitter: initialLitter,
        clouds: initialClouds,
        roadLineOffset: 0,
        score: 0,
        speed: 2.6, // Normal starting run speed
        spawnRate: initialSpawnDistance, // distance until next spawn (dino-style random spacing)
        gameActive: false,
      };
    }

    const game = gameEngineRef.current;

    const getTransparentSprite = (
      image: HTMLImageElement,
      sx: number,
      sy: number,
      sw: number,
      sh: number
    ) => {
      const cacheKey = `${image.src}:${sx}:${sy}:${sw}:${sh}`;
      const cached = transparentSpriteCacheRef.current.get(cacheKey);
      if (cached) return cached;

      if (!chromaCanvasRef.current) {
        chromaCanvasRef.current = document.createElement('canvas');
        chromaCtxRef.current = chromaCanvasRef.current.getContext('2d');
      }
      const tempCanvas = chromaCanvasRef.current;
      const tempCtx = chromaCtxRef.current;
      if (!tempCtx) return null;

      tempCanvas.width = sw;
      tempCanvas.height = sh;
      tempCtx.clearRect(0, 0, sw, sh);
      tempCtx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

      const imageData = tempCtx.getImageData(0, 0, sw, sh);
      const pixels = imageData.data;
      const isDogSprite = image.src.includes('dog-animated');
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const nearWhite = r > 220 && g > 220 && b > 220 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25;
        const dogEdgeWhite = isDogSprite && r > 190 && g > 190 && b > 190 && Math.abs(r - g) < 35 && Math.abs(g - b) < 35;
        if (nearWhite || dogEdgeWhite) {
          pixels[i + 3] = 0;
        }
      }
      tempCtx.putImageData(imageData, 0, 0);

      const processedCanvas = document.createElement('canvas');
      processedCanvas.width = sw;
      processedCanvas.height = sh;
      const processedCtx = processedCanvas.getContext('2d');
      if (!processedCtx) return null;
      processedCtx.drawImage(tempCanvas, 0, 0);
      transparentSpriteCacheRef.current.set(cacheKey, processedCanvas);
      return processedCanvas;
    };

    // Logo background transparency is pre-baked into `client/public/ritual-logo-bg.png`.
    // Keep this helper as an identity function for clarity/maintainability.
    const getLogoTransparentBg = (image: HTMLImageElement) => image;

    const drawSpriteWithTransparentWhite = (
      image: HTMLImageElement,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number
    ) => {
      const processed = getTransparentSprite(image, sx, sy, sw, sh);
      if (!processed) return;
      ctx.drawImage(processed, 0, 0, sw, sh, dx, dy, dw, dh);
    };

    // Draw street litter (decorative only, no collision)
    const drawStreetLitter = (litter: StreetLitter) => {
      ctx.save();
      ctx.translate(litter.x, litter.y);
      ctx.rotate((litter.rotation * Math.PI) / 180);
      ctx.globalAlpha = litter.opacity;

      switch (litter.type) {
        case 'bottle':
          // Plastic bottle
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(-litter.size / 2, -litter.size * 1.5, litter.size, litter.size * 3);
          ctx.fillStyle = '#A0522D';
          ctx.fillRect(-litter.size / 3, -litter.size * 1.8, litter.size * 0.7, litter.size * 0.6);
          break;
        case 'can':
          // Soda can
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(-litter.size / 2, -litter.size, litter.size, litter.size * 2);
          ctx.fillStyle = '#FF6B6B';
          ctx.fillRect(-litter.size / 2, -litter.size / 2, litter.size, litter.size / 2);
          break;
        case 'paper':
          // Crumpled paper
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(0, 0, litter.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#CCCCCC';
          ctx.lineWidth = 0.5;
          ctx.stroke();
          break;
        case 'bag':
          // Plastic bag
          ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
          ctx.fillRect(-litter.size, -litter.size / 2, litter.size * 2, litter.size);
          ctx.fillRect(-litter.size / 2, -litter.size * 1.2, litter.size, litter.size / 2);
          break;
        case 'cigarette':
          // Cigarette butt
          ctx.fillStyle = '#FFF8DC';
          ctx.fillRect(-litter.size / 3, -litter.size, litter.size * 0.7, litter.size * 2);
          ctx.fillStyle = '#D2691E';
          ctx.fillRect(-litter.size / 3, litter.size * 0.8, litter.size * 0.7, litter.size * 0.4);
          break;
      }

      ctx.restore();
    };

    // Draw cloud
    const drawCloud = (cloud: Cloud) => {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#2d5a3d';
      
      // Draw simple cloud shape with circles
      const baseY = cloud.y;
      ctx.beginPath();
      ctx.arc(cloud.x, baseY, cloud.width * 0.25, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.width * 0.3, baseY - cloud.width * 0.1, cloud.width * 0.3, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.width * 0.6, baseY, cloud.width * 0.25, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    };

    // Spawn obstacle with enhanced randomness
    const spawnObstacle = () => {
      // Weighted random selection for more variety
      const rand = Math.random();
      let randomType: ObstacleType;
      
      // Progressive difficulty: more overhead obstacles as score increases
      const overheadChance = Math.min(0.15 + game.score / 2000, 0.35);
      const dogChance = 0.4;
      
      if (rand < overheadChance) {
        randomType = 'overhead';
      } else if (rand < overheadChance + dogChance) {
        randomType = 'dog';
      } else {
        randomType = 'trash';
      }

      if (randomType === 'overhead') {
        // Overhead obstacle with slight Y variation
        const yVariation = Math.random() * 8 - 4; // +/- 4 pixels
        const obstacle: Obstacle = {
          x: canvas.width,
          y: canvas.height - 87 + yVariation,
          width: 80,
          height: 40,
          type: 'overhead',
          animationFrame: 0,
          animationCounter: 0,
          speedMultiplier: 0.95 + Math.random() * 0.2, // 0.95 - 1.15
        };
        game.obstacles.push(obstacle);
      } else {
        // Ground-level obstacles with variations
        const widthVariation = randomType === 'dog' ? (45 + Math.random() * 10) : (48 + Math.random() * 8);
        const heightVariation = randomType === 'dog' ? (55 + Math.random() * 10) : (58 + Math.random() * 8);
        
        const obstacle: Obstacle = {
          x: canvas.width,
          y: canvas.height - 80,
          width: widthVariation,
          height: heightVariation,
          type: randomType,
          animationFrame: 0,
          animationCounter: 0,
          speedMultiplier: randomType === 'dog' 
            ? (1.15 + Math.random() * 0.25)  // Dogs faster: 1.15 - 1.4
            : (0.95 + Math.random() * 0.2),  // Trash varied: 0.95 - 1.15
        };
        game.obstacles.push(obstacle);
      }
    };

    // Spawn street litter
    const spawnStreetLitter = () => {
      if (Math.random() < 0.08) { // 8% chance per frame - less frequent
        const litterTypes: StreetLitterType[] = ['bottle', 'can', 'paper', 'bag', 'cigarette'];
        game.streetLitter.push({
          x: canvas.width,
          y: canvas.height - 50 - Math.random() * 15,
          type: litterTypes[Math.floor(Math.random() * litterTypes.length)],
          size: 4 + Math.random() * 8,
          rotation: Math.random() * 360,
          opacity: 0.2 + Math.random() * 0.3, // More subtle
        });
      }
    };

    // Update game
    const update = () => {
      if (!game.gameActive) return;

      // Update Siggy animation
      game.siggy.animationCounter++;
      if (game.siggy.animationCounter > 8) {
        game.siggy.animationCounter = 0;
        if (game.siggy.isCrawling) {
          game.siggy.animationFrame = (game.siggy.animationFrame + 1) % 3;
        } else {
          game.siggy.animationFrame = (game.siggy.animationFrame + 1) % 4;
        }
      }

      // Update Siggy physics
      if (!game.siggy.isCrawling) {
        game.siggy.velocityY += game.siggy.gravity;
        game.siggy.y += game.siggy.velocityY;

        // Ground collision
        if (game.siggy.y + game.siggy.height >= canvas.height - 20) {
          game.siggy.y = canvas.height - game.siggy.height - 20;
          game.siggy.velocityY = 0;
          game.siggy.isJumping = false;
        }
      }

      // Update clouds
      for (const cloud of game.clouds) {
        cloud.x -= cloud.speed;
        if (cloud.x + cloud.width < 0) {
          cloud.x = canvas.width;
          cloud.y = 20 + Math.random() * 80;
          cloud.width = 40 + Math.random() * 60;
        }
      }

      // Update street litter
      for (let i = game.streetLitter.length - 1; i >= 0; i--) {
        const litter = game.streetLitter[i];
        litter.x -= game.speed * 0.8; // Slightly slower than obstacles for depth

        if (litter.x < -20) {
          game.streetLitter.splice(i, 1);
        }
      }

      // Spawn new street litter
      spawnStreetLitter();

      // Update obstacles
      for (let i = game.obstacles.length - 1; i >= 0; i--) {
        const obstacle = game.obstacles[i];
        obstacle.x -= game.speed * (obstacle.speedMultiplier ?? 1);

        // Update dog animation
        if (obstacle.type === 'dog') {
          if (!obstacle.animationCounter) obstacle.animationCounter = 0;
          if (!obstacle.animationFrame) obstacle.animationFrame = 0;
          
          obstacle.animationCounter++;
          if (obstacle.animationCounter > 4) {
            obstacle.animationCounter = 0;
            obstacle.animationFrame = (obstacle.animationFrame + 1) % 4;
          }
        }

        const siggyHitbox = {
          x: game.siggy.x + 12,
          y: game.siggy.y + (game.siggy.isCrawling ? 26 : 8),
          width: game.siggy.width - 24,
          height: game.siggy.isCrawling ? game.siggy.height - 30 : game.siggy.height - 16,
        };
        const obstaclePadding =
          obstacle.type === 'dog'
            ? { x: 10, y: 8 }
            : obstacle.type === 'trash'
              ? { x: 8, y: 6 }
              : { x: 14, y: 6 };
        const obstacleHitbox = {
          x: obstacle.x + obstaclePadding.x,
          y: obstacle.y + obstaclePadding.y,
          width: obstacle.width - obstaclePadding.x * 2,
          height: obstacle.height - obstaclePadding.y * 2,
        };

        // Collision detection with tighter hitboxes for fair near-misses
        if (
          siggyHitbox.x < obstacleHitbox.x + obstacleHitbox.width &&
          siggyHitbox.x + siggyHitbox.width > obstacleHitbox.x &&
          siggyHitbox.y < obstacleHitbox.y + obstacleHitbox.height &&
          siggyHitbox.y + siggyHitbox.height > obstacleHitbox.y
        ) {
          // Check if overhead and Siggy is crawling
          if (obstacle.type === 'overhead' && game.siggy.isCrawling) {
            // Safe - no collision
          } else {
            endGame();
          }
        }

        // Remove off-screen obstacles and increase score
        if (obstacle.x + obstacle.width < 0) {
          game.obstacles.splice(i, 1);
          game.score += 10;
          setGameState((prev) => ({
            ...prev,
            score: game.score,
          }));
        }
      }

      // Normal run at start, then gradually speed up as score grows.
      game.speed = Math.min(2.6 + game.score / 500, 4.4);

      // Enhanced random spacing with occasional patterns
      game.spawnRate -= game.speed;
      if (game.spawnRate <= 0) {
        spawnObstacle();
        
        // Decide on spacing pattern
        const patternRoll = Math.random();
        const baseMinSpacing = Math.max(220 - game.score / 40, 150);
        const baseMaxSpacing = Math.max(430 - game.score / 25, baseMinSpacing + 90);
        
        if (patternRoll < 0.15) {
          // Occasional tight cluster (15% chance)
          game.spawnRate = baseMinSpacing * 0.6 + Math.random() * 30;
        } else if (patternRoll < 0.30) {
          // Breather zone (15% chance)
          game.spawnRate = baseMaxSpacing * 1.3 + Math.random() * 80;
        } else {
          // Normal random spacing (70% chance)
          const variance = (baseMaxSpacing - baseMinSpacing) * (0.3 + Math.random() * 0.7);
          game.spawnRate = baseMinSpacing + variance;
        }
      }
    };

    // Draw game
    const draw = () => {
      // Clear canvas with sky gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#d4e7dd');
      gradient.addColorStop(0.5, '#e8f0e8');
      gradient.addColorStop(1, '#f5f1ed');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw clouds
      for (const cloud of game.clouds) {
        drawCloud(cloud);
      }

      // Draw Ritual logo in background
      if (spritesRef.current.ritualLogo) {
        const logoSize = 125;
        const logoX = canvas.width / 2 - logoSize / 2;
        const logoY = canvas.height / 2 - logoSize / 2;
        ctx.save();
        const transparentLogo = getLogoTransparentBg(spritesRef.current.ritualLogo);
        ctx.globalAlpha = 1;
        ctx.drawImage(transparentLogo ?? spritesRef.current.ritualLogo, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }

      // Draw road/ground with simpler design
      ctx.fillStyle = '#4a5f4a';
      ctx.fillRect(0, canvas.height - 50, canvas.width, 30);
      
      // Draw subtle road edge lines (static, not animated)
      ctx.strokeStyle = 'rgba(212, 197, 160, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - 48);
      ctx.lineTo(canvas.width, canvas.height - 48);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - 22);
      ctx.lineTo(canvas.width, canvas.height - 22);
      ctx.stroke();

      // Draw ground edge
      ctx.fillStyle = '#2d5a3d';
      ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

      // Draw street litter (behind everything)
      for (const litter of game.streetLitter) {
        drawStreetLitter(litter);
      }

      // Draw Siggy with animation (clean sprites with transparent backgrounds)
      if (game.siggy.isCrawling && spritesRef.current.siggyCrawling) {
        const frameWidth = spritesRef.current.siggyCrawling.width / 3;
        const frameHeight = spritesRef.current.siggyCrawling.height;
        drawSpriteWithTransparentWhite(
          spritesRef.current.siggyCrawling,
          game.siggy.animationFrame * frameWidth,
          0,
          frameWidth,
          frameHeight,
          game.siggy.x,
          game.siggy.y + 20,
          game.siggy.width,
          game.siggy.height - 20
        );
      } else if (spritesRef.current.siggyRunning) {
        const frameWidth = spritesRef.current.siggyRunning.width / 4;
        const frameHeight = spritesRef.current.siggyRunning.height;
        drawSpriteWithTransparentWhite(
          spritesRef.current.siggyRunning,
          game.siggy.animationFrame * frameWidth,
          0,
          frameWidth,
          frameHeight,
          game.siggy.x,
          game.siggy.y,
          game.siggy.width,
          game.siggy.height
        );
      }

      // Draw obstacles
      for (const obstacle of game.obstacles) {
        if (obstacle.type === 'trash' && spritesRef.current.trashBin) {
          drawSpriteWithTransparentWhite(
            spritesRef.current.trashBin,
            0,
            0,
            spritesRef.current.trashBin.width,
            spritesRef.current.trashBin.height,
            obstacle.x,
            obstacle.y,
            obstacle.width,
            obstacle.height
          );
        } else if (obstacle.type === 'dog' && spritesRef.current.dog) {
          // Draw animated dog with frame
          const frameWidth = spritesRef.current.dog.width / 4;
          const frameHeight = spritesRef.current.dog.height;
          const dogFrame = obstacle.animationFrame || 0;
          drawSpriteWithTransparentWhite(
            spritesRef.current.dog,
            dogFrame * frameWidth,
            0,
            frameWidth,
            frameHeight,
            obstacle.x,
            obstacle.y,
            obstacle.width,
            obstacle.height
          );
        } else if (obstacle.type === 'overhead' && spritesRef.current.overhead) {
          drawSpriteWithTransparentWhite(
            spritesRef.current.overhead,
            0,
            0,
            spritesRef.current.overhead.width,
            spritesRef.current.overhead.height,
            obstacle.x,
            obstacle.y,
            obstacle.width,
            obstacle.height
          );
        }
      }

      // Draw score with better styling
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#2d5a3d';
      ctx.font = 'bold 28px serif';
      ctx.fillText(`Score: ${game.score}`, 20, 45);
      ctx.font = '18px serif';
      ctx.fillText(`Best: ${gameState.highScore}`, 20, 75);
      
      // Draw token balance
      ctx.font = 'bold 16px serif';
      ctx.fillStyle = '#d4a017';
      ctx.fillText(`🪙 ${gameState.tokenBalance}`, 20, 100);
      ctx.restore();

      // Draw speed indicator
      ctx.fillStyle = '#2d5a3d';
      ctx.font = '14px serif';
      ctx.fillText(`Speed: ${game.speed.toFixed(1)}x`, 20, 125);

      // Draw crawl indicator
      if (game.siggy.isCrawling) {
        ctx.fillStyle = '#2d5a3d';
        ctx.font = 'bold 14px serif';
        ctx.fillText('CRAWLING', game.siggy.x - 10, game.siggy.y - 10);
      }
    };

    const endGame = () => {
      game.gameActive = false;
      const newHighScore = Math.max(game.score, gameState.highScore);
      const newTokenBalance = gameState.tokenBalance + game.score; // Add score to tokens
      
      localStorage.setItem('siggy-highscore', newHighScore.toString());
      localStorage.setItem('siggy-tokens', newTokenBalance.toString());
      
      setGameState((prev) => ({
        ...prev,
        gameOver: true,
        score: game.score,
        highScore: newHighScore,
        isRunning: false,
        tokenBalance: newTokenBalance,
      }));
    };

    // Game loop
    const gameLoop = () => {
      update();
      draw();
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!game.gameActive && gameState.gameOver) {
          resetGame();
        } else if (!game.siggy.isJumping && game.gameActive && !game.siggy.isCrawling) {
          game.siggy.velocityY = game.siggy.jumpPower;
          game.siggy.isJumping = true;
        }
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        if (game.gameActive && !game.siggy.isJumping) {
          game.siggy.isCrawling = true;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown') {
        game.siggy.isCrawling = false;
      }
    };

    // Touch controls
    const handleTouchStart = () => {
      if (!game.gameActive && gameState.gameOver) {
        resetGame();
      } else if (!game.siggy.isJumping && game.gameActive && !game.siggy.isCrawling) {
        game.siggy.velocityY = game.siggy.jumpPower;
        game.siggy.isJumping = true;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('touchstart', handleTouchStart);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [spritesLoaded, gameState.highScore, gameState.gameOver, gameState.tokenBalance]);

  const startGame = () => {
    // Check if player has enough tokens
    if (gameState.tokenBalance < 50) {
      return; // Don't start if insufficient tokens
    }

    if (gameEngineRef.current) {
      const game = gameEngineRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Deduct 50 tokens per game
      const newTokenBalance = gameState.tokenBalance - 50;
      localStorage.setItem('siggy-tokens', newTokenBalance.toString());

      game.gameActive = true;
      game.score = 0;
      game.speed = 2.6; // Normal starting speed
      game.obstacles = [];
      game.spawnRate = 280 + Math.random() * 180;
      
      // Reset street litter
      game.streetLitter = [];
      for (let i = 0; i < 6; i++) {
        game.streetLitter.push({
          x: Math.random() * canvas.width,
          y: canvas.height - 50 - Math.random() * 15,
          type: ['bottle', 'can', 'paper', 'bag', 'cigarette'][Math.floor(Math.random() * 5)] as StreetLitterType,
          size: 4 + Math.random() * 8,
          rotation: Math.random() * 360,
          opacity: 0.2 + Math.random() * 0.3, // More subtle
        });
      }

      game.siggy.y = canvas.height - 100;
      game.siggy.velocityY = 0;
      game.siggy.isJumping = false;
      game.siggy.isCrawling = false;
      game.siggy.animationFrame = 0;
      game.siggy.animationCounter = 0;
      
      setGameState((prev) => ({
        ...prev,
        isRunning: true,
        gameOver: false,
        score: 0,
        tokenBalance: newTokenBalance,
        gamesPlayed: prev.gamesPlayed + 1,
      }));
      setTxStatus('');
    }
  };

  const resetGame = () => {
    startGame();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#f5f1ed' }}>
      <div className="w-full max-w-2xl px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold" style={{ color: '#2d5a3d' }}>Jumping Siggy</h1>
          <p className="text-lg mt-2" style={{ color: '#2d5a3d' }}>An endless runner on Ritual Net</p>
        </div>

        {/* Wallet Bar — single compact row */}
        <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg"
          style={{ backgroundColor: '#e8f5e9', border: '1px solid #2d5a3d' }}>

          {/* Left: connection status */}
          {walletState.isConnected ? (
            <span className="text-xs font-mono" style={{ color: '#2d5a3d' }}>
              ✓ {formatAddress(walletState.address || '')}
            </span>
          ) : isWalletAvailable() ? (
            <button
              onClick={handleConnectWallet}
              className="text-xs font-semibold underline"
              style={{ color: '#2d5a3d', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Connect Wallet
            </button>
          ) : (
            <span className="text-xs" style={{ color: '#2d5a3d' }}>Guest mode</span>
          )}

          {/* Center: token balance */}
          <span className="text-sm font-bold" style={{ color: '#2d5a3d' }}>
            🪙 {gameState.tokenBalance}
            <span className="font-normal text-xs ml-1">
              {walletState.isConnected ? 'tokens' : 'tokens (guest)'}
            </span>
          </span>

          {/* Right: disconnect or no-wallet hint */}
          {walletState.isConnected ? (
            <button
              onClick={handleDisconnectWallet}
              className="text-xs underline"
              style={{ color: '#7a4f00', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Disconnect
            </button>
          ) : (
            <span className="text-xs" style={{ color: '#9e9e9e' }}>
              {isWalletAvailable() ? '' : 'No wallet'}
            </span>
          )}
        </div>

        {/* Wrong Network Banner */}
        {walletState.isConnected && !isOnCorrectChain && (
          <div className="mb-4 p-4 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3"
            style={{ backgroundColor: '#fff3cd', border: '2px solid #f0a500' }}>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-bold text-sm" style={{ color: '#7a4f00' }}>Wrong Network</p>
                <p className="text-xs" style={{ color: '#7a4f00' }}>
                  You're on chain {walletState.chainId ?? '?'}. Switch to Ritual Chain (ID {RITUAL_NET_CHAIN_ID}) to get tokens.
                </p>
              </div>
            </div>
            <Button
              onClick={handleSwitchNetwork}
              disabled={networkSwitching}
              className="text-sm font-semibold px-4 py-2 whitespace-nowrap"
              style={{ backgroundColor: '#f0a500', color: '#fff' }}
            >
              {networkSwitching ? 'Switching...' : '🔄 Switch to Ritual Chain'}
            </Button>
          </div>
        )}

        {/* Game Canvas */}
        <div className="flex justify-center mb-8">
          <canvas
            ref={canvasRef}
            width={800}
            height={400}
            className="border-4 rounded-lg shadow-lg"
            style={{ borderColor: '#2d5a3d', backgroundColor: '#f5f1ed' }}
          />
        </div>

        {/* Sprites Loading Status */}
        {!spritesLoaded && (
          <div className="text-center mb-4 p-3 rounded-lg" style={{ backgroundColor: '#fff3e0', borderColor: '#2d5a3d', border: '1px solid' }}>
            <p className="text-sm" style={{ color: '#2d5a3d' }}>
              Loading game assets...
            </p>
          </div>
        )}

        {/* Transaction Status */}
        {txStatus && (
          <div className="text-center mb-4 p-3 rounded-lg relative" style={{ 
            backgroundColor: txStatus.includes('Error') || txStatus.includes('error') ? '#ffebee' : '#fff3e0', 
            borderColor: '#2d5a3d', 
            border: '1px solid' 
          }}>
            <button
              onClick={() => setTxStatus('')}
              className="absolute top-2 right-2 text-lg font-bold"
              style={{ color: '#2d5a3d' }}
            >
              ×
            </button>
            <p className="text-sm pr-6" style={{ color: '#2d5a3d' }}>
              {txStatus}
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="text-center space-y-4">
          {!gameState.isRunning && !gameState.gameOver && spritesLoaded && (
            <>
              {gameState.tokenBalance < 50 ? (
                <div className="p-6 rounded-lg" style={{ backgroundColor: '#ffebee', borderColor: '#c62828', border: '2px solid' }}>
                  <p className="text-xl font-bold mb-3" style={{ color: '#c62828' }}>
                    ⚠️ Insufficient Tokens!
                  </p>
                  <p className="text-sm mb-4" style={{ color: '#2d5a3d' }}>
                    {gameState.walletConnected 
                      ? 'Request 500 tokens from the blockchain to start playing!'
                      : 'You need at least 50 tokens to play. Connect your wallet to get more tokens!'}
                  </p>
                  {!gameState.walletConnected && (
                    <Button
                      onClick={handleConnectWallet}
                      className="px-6 py-3 text-lg font-semibold"
                      style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                    >
                      Connect Wallet for Tokens
                    </Button>
                  )}
                  {gameState.walletConnected && (
                    isOnCorrectChain ? (
                      <Button
                        onClick={handleProofOfPresence}
                        disabled={txLoading}
                        className="px-6 py-3 text-lg font-semibold"
                        style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                      >
                        {txLoading ? 'Processing...' : 'Get 500 Tokens (0.00001 gas)'}
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSwitchNetwork}
                        disabled={networkSwitching}
                        className="px-6 py-3 text-lg font-semibold"
                        style={{ backgroundColor: '#f0a500', color: '#fff' }}
                      >
                        {networkSwitching ? 'Switching...' : '🔄 Switch to Ritual Chain First'}
                      </Button>
                    )
                  )}
                </div>
              ) : (
                <>
                  {gameState.walletConnected ? (
                    <div className="space-y-3">
                      {isOnCorrectChain ? (
                        <Button
                          onClick={handleProofOfPresence}
                          disabled={txLoading}
                          className="px-8 py-3 text-lg font-semibold"
                          style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                        >
                          {txLoading ? 'Processing...' : 'Get 500 More Tokens (0.00001 gas)'}
                        </Button>
                      ) : (
                        <Button
                          onClick={handleSwitchNetwork}
                          disabled={networkSwitching}
                          className="px-8 py-3 text-lg font-semibold"
                          style={{ backgroundColor: '#f0a500', color: '#fff' }}
                        >
                          {networkSwitching ? 'Switching...' : '🔄 Switch to Ritual Chain'}
                        </Button>
                      )}
                      <p className="text-xs" style={{ color: '#2d5a3d' }}>or</p>
                      <Button
                        onClick={startGame}
                        className="px-8 py-3 text-lg font-semibold"
                        style={{ backgroundColor: '#4a5f4a', color: '#f5f1ed' }}
                      >
                        Start Game (-50 tokens)
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={startGame}
                      className="px-8 py-3 text-lg font-semibold"
                      style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                    >
                      Start Game (-50 tokens)
                    </Button>
                  )}
                </>
              )}
            </>
          )}

          {gameState.gameOver && (
            <div className="text-center">
              <p className="text-2xl font-bold mb-4" style={{ color: '#2d5a3d' }}>
                Game Over!
              </p>
              <div className="space-y-2 mb-4">
                <p className="text-lg" style={{ color: '#2d5a3d' }}>
                  Final Score: <strong>{gameState.score}</strong>
                </p>
                <p className="text-md" style={{ color: '#2d5a3d' }}>
                  🪙 Tokens Earned: <strong>+{gameState.score}</strong>
                </p>
                <p className="text-sm" style={{ color: '#2d5a3d' }}>
                  Total Balance: <strong>{gameState.tokenBalance} tokens</strong>
                </p>
              </div>
              {!gameState.walletConnected && gameState.tokenBalance < 100 && (
                <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: '#e3f2fd', borderColor: '#2d5a3d', border: '1px solid' }}>
                  <p className="text-sm mb-3" style={{ color: '#2d5a3d' }}>
                    Running low on tokens? Connect your wallet to get 500 tokens per transaction!
                  </p>
                  <Button
                    onClick={handleConnectWallet}
                    className="px-4 py-2 text-sm font-semibold"
                    style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                  >
                    Connect Wallet Now
                  </Button>
                </div>
              )}
              {gameState.tokenBalance >= 50 ? (
                <Button
                  onClick={resetGame}
                  className="px-8 py-3 text-lg font-semibold"
                  style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                >
                  Play Again (-50 tokens)
                </Button>
              ) : (
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#ffebee', borderColor: '#c62828', border: '1px solid' }}>
                  <p className="text-sm mb-3" style={{ color: '#c62828' }}>
                    {gameState.walletConnected 
                      ? 'Request more tokens from the blockchain to continue!'
                      : 'Not enough tokens. Connect wallet for blockchain tokens!'}
                  </p>
                  {gameState.walletConnected ? (
                    isOnCorrectChain ? (
                      <Button
                        onClick={handleProofOfPresence}
                        disabled={txLoading}
                        className="px-4 py-2 text-sm font-semibold"
                        style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                      >
                        {txLoading ? 'Processing...' : 'Get 500 Tokens'}
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSwitchNetwork}
                        disabled={networkSwitching}
                        className="px-4 py-2 text-sm font-semibold"
                        style={{ backgroundColor: '#f0a500', color: '#fff' }}
                      >
                        {networkSwitching ? 'Switching...' : '🔄 Switch to Ritual Chain'}
                      </Button>
                    )
                  ) : (
                    <Button
                      onClick={handleConnectWallet}
                      className="px-4 py-2 text-sm font-semibold"
                      style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                    >
                      Connect Wallet
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <p className="text-sm" style={{ color: '#2d5a3d' }}>
            Press <strong>SPACE</strong> to jump | <strong>DOWN ARROW</strong> to crawl | <strong>TAP</strong> to jump
          </p>
          <p className="text-xs" style={{ color: '#2d5a3d' }}>
            {gameState.walletConnected 
              ? '💰 50 tokens per game | Earn tokens = your score | Get 500 tokens via blockchain'
              : '💰 50 tokens per game | Score adds to token balance | 500 guest tokens'}
          </p>
        </div>
      </div>
    </div>
  );
}