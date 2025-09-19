import { DeepBookClient } from '@mysten/deepbook-v3';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import * as dotenv from 'dotenv';

dotenv.config(); // Load .env with PRIVATE_KEY

// Config
const PRIVATE_KEY = process.env.PRIVATE_KEY!; // Your Sui wallet private key (base64)
const ENV = 'mainnet' as const; // or 'testnet'
const POOL_ID = '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb::deepbook::WBTC_SUI_POOL'; // Replace with actual WBTC/SUI pool ID from explorer
const FIXED_SUI_AMOUNT = 1000000000n; // 10 SUI (in MIST, 1 SUI = 1e9 MIST)
const BALANCE_MANAGER_ID = '0x...'; // Your pre-created balance manager ID

async function dcaBuyWBTC() {
  // Setup keypair and client
  const keypair = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(`0x${PRIVATE_KEY}`));
  const suiClient = new SuiClient({ url: getFullnodeUrl(ENV) });
  const dbClient = new DeepBookClient({
    client: suiClient,
    address: keypair.toSuiAddress(),
    env: ENV,
    balanceManagers: [{ manager: BALANCE_MANAGER_ID }],
  });

  const tx = new Transaction();

  // Deposit SUI into balance manager (if not already)
  dbClient.balanceManager.depositIntoManager(BALANCE_MANAGER_ID, '0x2::sui::SUI', FIXED_SUI_AMOUNT)(tx);

  // Place market buy order: Buy wBTC with FIXED_SUI_AMOUNT SUI at market price
  // (Uses swapBaseForQuote for buying quote asset with base; adjust for direction)
  const marketBuy = dbClient.pool.swapMarket(
    POOL_ID,
    '0x2::sui::SUI', // Base asset (SUI)
    FIXED_SUI_AMOUNT, // Amount in
    BigInt(0), // Min out (set low for market; use TWAP for better pricing)
    tx.epochTimestampMs // Clock for timestamp
  );
  tx.moveCall({
    target: marketBuy.target,
    arguments: marketBuy.arguments,
    typeArguments: marketBuy.typeArguments,
  });

  // Execute and settle (withdraw wBTC to wallet if desired)
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  });

  console.log('DCA Buy Executed:', result.digest);
  return result;
}

// Run DCA (schedule this with cron: e.g., node dca.js >> log.txt)
dcaBuyWBTC().catch(console.error);
