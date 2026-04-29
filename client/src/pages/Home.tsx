import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import { connectWallet, disconnectWallet, formatAddress, getWalletState, isMetaMaskAvailable, type WalletState } from '@/lib/wallet';
import { submitProofOfPresence, waitForTransaction } from '@/lib/ritual-tx';

const SIGGY_RUNNING_FRAMES_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/siggy-running-clean-Pfsud86v8uhqjd7mJUA4ZQ.webp';
const SIGGY_CRAWLING_FRAMES_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/siggy-crawling-clean-4yjqakUBGzRCsQvhExHLkq.webp';
const TRASH_BIN_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/trash-bin-clean-bHj6Xke2nTHccozhFxf2eE.webp';
const DOG_OBSTACLE_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/dog-animated-UZMpqB5obhcUh85euvMMEF.webp';
const OVERHEAD_OBSTACLE_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/overhead-clean-ayPE6TiiVEZG5Fqv4TcrZy.webp';
const RITUAL_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663486032989/ZbgRLzMTREe6UC24SXuh8R/ritual-logo-Zf7HiiCkZGb7ure69PQcKv.webp';

interface GameState {
  isRunning: boolean;
  score: number;
  highScore: number;
  gameOver: boolean;
  walletConnected: boolean;
}

type ObstacleType = 'trash' | 'dog' | 'overhead';

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

  // Check wallet state on mount
  useEffect(() => {
    const checkWallet = async () => {
      const state = await getWalletState();
      setWalletState(state);
      setGameState((prev) => ({
        ...prev,
        walletConnected: state.isConnected,
      }));
    };
    checkWallet();
  }, []);

  // Handle wallet connection
  const handleConnectWallet = async () => {
    const state = await connectWallet();
    setWalletState(state);
    setGameState((prev) => ({
      ...prev,
      walletConnected: state.isConnected,
    }));
    if (state.error) {
      setTxStatus(`Error: ${state.error}`);
    }
  };

  // Handle wallet disconnection
  const handleDisconnectWallet = async () => {
    const state = await disconnectWallet();
    setWalletState(state);
    setGameState((prev) => ({
      ...prev,
      walletConnected: state.isConnected,
    }));
    setTxStatus('');
    setTxLoading(false);
  };

  // Submit proof-of-presence transaction
  const handleProofOfPresence = async () => {
    if (!walletState.address) return;

    setTxLoading(true);
    setTxStatus('Submitting proof-of-presence transaction...');

    try {
      const result = await submitProofOfPresence(walletState.address, gameState.highScore);

      if (result.success && result.txHash) {
        setTxStatus('Transaction submitted! Waiting for confirmation...');
        const confirmed = await waitForTransaction(result.txHash);

        if (confirmed) {
          setTxStatus('✓ Proof-of-presence recorded on Ritual Net!');
          setTimeout(() => {
            setTxStatus('');
            startGame();
          }, 2000);
        } else {
          setTxStatus('Transaction pending or failed. You can still play!');
          setTimeout(() => {
            setTxStatus('');
            startGame();
          }, 2000);
        }
      } else {
        setTxStatus(`Error: ${result.error}`);
      }
    } catch (error: any) {
      setTxStatus(`Error: ${error.message}`);
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

    // Spawn obstacle
    const spawnObstacle = () => {
      const obstacleTypes: ObstacleType[] = ['trash', 'dog', 'overhead'];
      const randomType = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];

      if (randomType === 'overhead') {
        // Overhead obstacle positioned lower so Siggy can crawl under it
        const obstacle: Obstacle = {
          x: canvas.width,
          y: canvas.height - 87, // Lowered further so standing collides and crawl/jump choice is required
          width: 80,
          height: 40,
          type: 'overhead',
          animationFrame: 0,
          animationCounter: 0,
          speedMultiplier: 1.05,
        };
        game.obstacles.push(obstacle);
      } else {
        // Ground-level obstacles
        const obstacle: Obstacle = {
          x: canvas.width,
          y: canvas.height - 80,
          width: 50,
          height: 60,
          type: randomType,
          animationFrame: 0,
          animationCounter: 0,
          speedMultiplier: randomType === 'dog' ? 1.25 : 1.05,
        };
        game.obstacles.push(obstacle);
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

      // Dino-like random spacing based on travel distance, not fixed frame timers.
      game.spawnRate -= game.speed;
      if (game.spawnRate <= 0) {
        spawnObstacle();
        const minSpacing = Math.max(220 - game.score / 40, 150);
        const maxSpacing = Math.max(430 - game.score / 25, minSpacing + 90);
        game.spawnRate = minSpacing + Math.random() * (maxSpacing - minSpacing);
      }
    };

    // Draw game
    const draw = () => {
      // Clear canvas
      ctx.fillStyle = '#f5f1ed';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Ritual logo in background
      if (spritesRef.current.ritualLogo) {
        const logoSize = 150;
        const logoX = canvas.width / 2 - logoSize / 2;
        const logoY = canvas.height / 2 - logoSize / 2;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.shadowColor = '#2bff7a';
        ctx.shadowBlur = 32;
        ctx.drawImage(
          spritesRef.current.ritualLogo,
          logoX,
          logoY,
          logoSize,
          logoSize
        );
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#35ff86';
        ctx.fillRect(logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }

      // Draw ground
      ctx.fillStyle = '#2d5a3d';
      ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

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

      // Draw score
      ctx.fillStyle = '#2d5a3d';
      ctx.font = 'bold 24px serif';
      ctx.fillText(`Score: ${game.score}`, 20, 40);
      ctx.font = '16px serif';
      ctx.fillText(`Best: ${gameState.highScore}`, 20, 70);

      // Draw speed indicator
      ctx.font = '12px serif';
      ctx.fillText(`Speed: ${game.speed.toFixed(1)}x`, 20, 90);

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
      localStorage.setItem('siggy-highscore', newHighScore.toString());
      setGameState((prev) => ({
        ...prev,
        gameOver: true,
        score: game.score,
        highScore: newHighScore,
        isRunning: false,
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
  }, [spritesLoaded, gameState.highScore, gameState.gameOver]);

  const startGame = () => {
    if (gameEngineRef.current) {
      const game = gameEngineRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;

      game.gameActive = true;
      game.score = 0;
      game.speed = 2.6; // Normal starting speed
      game.obstacles = [];
      game.spawnRate = 280 + Math.random() * 180;
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

        {/* Wallet Connection */}
        <div className="text-center mb-6">
          {isMetaMaskAvailable() ? (
            walletState.isConnected ? (
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-lg" style={{ backgroundColor: '#e8f5e9', borderColor: '#2d5a3d', border: '1px solid' }}>
                <p className="text-sm" style={{ color: '#2d5a3d' }}>
                  ✓ Connected: {formatAddress(walletState.address || '')}
                </p>
                <Button
                  onClick={handleDisconnectWallet}
                  variant="secondary"
                  className="px-4 py-1 text-sm font-semibold"
                  style={{ backgroundColor: '#f5f1ed', color: '#2d5a3d', border: '1px solid #2d5a3d' }}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleConnectWallet}
                className="px-6 py-2 text-sm font-semibold"
                style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
              >
                Connect MetaMask
              </Button>
            )
          ) : (
            <p className="text-sm" style={{ color: '#2d5a3d' }}>
              MetaMask not detected. Play as guest or install MetaMask.
            </p>
          )}
        </div>

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
          <div className="text-center mb-4 p-3 rounded-lg" style={{ backgroundColor: '#fff3e0', borderColor: '#2d5a3d', border: '1px solid' }}>
            <p className="text-sm" style={{ color: '#2d5a3d' }}>
              {txStatus}
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="text-center space-y-4">
          {!gameState.isRunning && !gameState.gameOver && spritesLoaded && (
            <>
              {gameState.walletConnected ? (
                <Button
                  onClick={handleProofOfPresence}
                  disabled={txLoading}
                  className="px-8 py-3 text-lg font-semibold"
                  style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                >
                  {txLoading ? 'Processing...' : 'Start Game (Record on-chain)'}
                </Button>
              ) : (
                <Button
                  onClick={startGame}
                  className="px-8 py-3 text-lg font-semibold"
                  style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
                >
                  Start Game (Guest Mode)
                </Button>
              )}
            </>
          )}

          {gameState.gameOver && (
            <div className="text-center">
              <p className="text-2xl font-bold mb-4" style={{ color: '#2d5a3d' }}>
                Game Over!
              </p>
              <p className="text-lg mb-4" style={{ color: '#2d5a3d' }}>
                Final Score: {gameState.score}
              </p>
              {!gameState.walletConnected && (
                <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: '#e3f2fd', borderColor: '#2d5a3d', border: '1px solid' }}>
                  <p className="text-sm mb-3" style={{ color: '#2d5a3d' }}>
                    Connect your wallet to record your score on Ritual Net and compete with others!
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
              <Button
                onClick={resetGame}
                className="px-8 py-3 text-lg font-semibold"
                style={{ backgroundColor: '#2d5a3d', color: '#f5f1ed' }}
              >
                Play Again
              </Button>
            </div>
          )}

          <p className="text-sm" style={{ color: '#2d5a3d' }}>
            Press <strong>SPACE</strong> to jump | <strong>DOWN ARROW</strong> to crawl | <strong>TAP</strong> to jump
          </p>
        </div>
      </div>
    </div>
  );
}
