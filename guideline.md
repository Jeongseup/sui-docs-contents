# DeepBookV3를 이용한 DCA 봇 개발 가이드

이 문서는 Sui의 DeepBookV3 SDK를 사용하여 BTC/USDC 페어에 대한 DCA(Dollar-Cost Averaging, 적립식 정액 매수) 봇을 개발하는 방법을 안내합니다.

제공된 샘플 코드를 기반으로 실제 동작 가능한 코드를 작성하고, 프로젝트 설정부터 실행까지의 전체 과정을 단계별로 설명합니다.

---

## 목차

1.  [프로젝트 초기 설정](#1-프로젝트-초기-설정)
2.  [환경 변수 설정](#2-환경-변수-설정)
3.  [TypeScript 설정](#3-typescript-설정)
4.  [DCA 봇 코드 작성](#4-dca-봇-코드-작성)
5.  [핵심 코드 설명 및 샘플 코드와의 차이점](#5-핵심-코드-설명-및-샘플-코드와의-차이점)
6.  [봇 실행 및 향후 개선 사항](#6-봇-실행-및-향후-개선-사항)

---

## 1. 프로젝트 초기 설정

먼저, Node.js 프로젝트를 생성하고 필요한 라이브러리를 설치합니다.

```bash
# 1. 프로젝트 디렉토리 생성 및 이동
mkdir sui-dca-bot
cd sui-dca-bot

# 2. npm 프로젝트 초기화 (-y 플래그로 기본값 사용)
npm init -y

# 3. 프로덕션 의존성 설치
# @mysten/sui: Sui TypeScript SDK
# @mysten/deepbook-v3: DeepBookV3 SDK
# dotenv: .env 파일 관리를 위한 라이브러리
npm install @mysten/sui @mysten/deepbook-v3 dotenv

# 4. 개발 의존성 설치
# typescript: TypeScript 컴파일러
# ts-node: TypeScript 코드를 직접 실행하기 위한 도구
# @types/node: Node.js 타입 정의
npm install -D typescript ts-node @types/node
```

---

## 2. 환경 변수 설정

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고, 봇을 실행할 지갑의 비공개 키를 추가합니다.

**`.env`**
```
# 주의: 이 파일은 git에 커밋하지 마세요!
# Sui 지갑의 Base64 인코딩된 32바이트 비공개 키 앞에 0x를 붙여서 입력합니다.
# 예: 0xAbCd...
PRIVATE_KEY="YOUR_SUI_PRIVATE_KEY"
```

---

## 3. TypeScript 설정

TypeScript 컴파일러 설정을 위해 `tsconfig.json` 파일을 프로젝트 루트에 생성합니다.

**`tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

---

## 4. DCA 봇 코드 작성

프로젝트 루트에 `dca-bot.ts` 파일을 생성하고 아래의 전체 코드를 붙여넣습니다. 이 코드는 샘플 코드의 의도를 바탕으로 DeepBookV3 SDK의 실제 사용법에 맞게 수정 및 보완되었습니다.

**`dca-bot.ts`**
```typescript
import { DeepBookClient } from '@mysten/deepbook-v3';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import path from 'path';

// .env 파일에서 환경 변수 로드
dotenv.config();

// --- 설정 (Configuration) ---
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY를 .env 파일에 설정해야 합니다.');
}

const ENV = 'mainnet'; // 'mainnet' 또는 'testnet'
const BALANCE_MANAGER_STORE_PATH = path.join(__dirname, 'balanceManager.json');

// DCA 설정
// Mainnet의 Wormhole BTC와 USDC 타입
const BASE_COIN_TYPE = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN'; // WBTC (Wrapped Bitcoin)
const QUOTE_COIN_TYPE = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN'; // USDC (Wrapped USD Coin)
const FIXED_QUOTE_AMOUNT = 10; // 매수할 USDC 금액 (예: 10 USDC)

// Balance Manager 키 (SDK 내부에서 식별자로 사용)
const BALANCE_MANAGER_KEY = 'DCA_MANAGER_1';

/**
 * 이전에 생성된 Balance Manager ID를 로드하거나 새로 생성합니다.
 * Balance Manager는 거래를 위해 자금을 예치하는 계정 역할을 하며, 한 번만 생성하면 됩니다.
 */
async function getOrCreateBalanceManager(suiClient: SuiClient, keypair: Ed25519Keypair): Promise<string> {
  if (fs.existsSync(BALANCE_MANAGER_STORE_PATH)) {
    const data = JSON.parse(fs.readFileSync(BALANCE_MANAGER_STORE_PATH, 'utf-8'));
    console.log(`기존 Balance Manager ID를 로드했습니다: ${data.managerId}`);
    return data.managerId;
  }

  console.log('새로운 Balance Manager를 생성합니다...');
  // Balance Manager 생성을 위한 임시 클라이언트
  const tempDbClient = new DeepBookClient({
    client: suiClient,
    address: keypair.toSuiAddress(),
    env: ENV,
  });

  const tx = new Transaction();
  tx.add(tempDbClient.balanceManager.createAndShareBalanceManager());

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showObjectChanges: true },
  });

  const createdObject = result.objectChanges?.find(
    (change) => change.type === 'created' && change.objectType.endsWith('::balance_manager::BalanceManager')
  );

  if (!createdObject || !('objectId' in createdObject)) {
    throw new Error('Balance Manager 생성에 실패했습니다.');
  }

  const managerId = createdObject.objectId;
  console.log(`새로운 Balance Manager가 생성되었습니다: ${managerId}`);
  fs.writeFileSync(BALANCE_MANAGER_STORE_PATH, JSON.stringify({ managerId }));

  return managerId;
}

async function dcaBuyBtc() {
  // 1. 클라이언트 및 키페어 설정
  const { secretKey } = decodeSuiPrivateKey(PRIVATE_KEY);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const suiClient = new SuiClient({ url: getFullnodeUrl(ENV) });

  // 2. Balance Manager 가져오기 또는 생성하기
  const balanceManagerId = await getOrCreateBalanceManager(suiClient, keypair);

  // 3. DeepBook 클라이언트 초기화 (Balance Manager 정보 포함)
  const dbClient = new DeepBookClient({
    client: suiClient,
    address: keypair.toSuiAddress(),
    env: ENV,
    balanceManagers: {
      [BALANCE_MANAGER_KEY]: { address: balanceManagerId },
    },
  });

  // 4. 코인 타입을 이용해 동적으로 Pool ID 조회
  console.log(`'${BASE_COIN_TYPE}'와 '${QUOTE_COIN_TYPE}'의 Pool을 조회합니다...`);
  const poolId = await dbClient.pool.getPoolIdByAssets(BASE_COIN_TYPE, QUOTE_COIN_TYPE);
  if (!poolId) {
    throw new Error('해당 코인 페어의 Pool을 찾을 수 없습니다.');
  }
  console.log(`Pool ID를 찾았습니다: ${poolId}`);

  // 5. DCA 매수 트랜잭션 생성
  const tx = new Transaction();

  // 5-1. Balance Manager에 USDC 예치
  // 지갑에 있는 USDC 코인 중 일부를 예치합니다.
  // 이 함수는 자동으로 지갑에서 사용 가능한 코인을 찾아 예치 트랜잭션을 구성합니다.
  console.log(`${FIXED_QUOTE_AMOUNT} USDC를 Balance Manager에 예치합니다...`);
  dbClient.balanceManager.depositIntoManager(
      BALANCE_MANAGER_KEY,
      QUOTE_COIN_TYPE,
      FIXED_QUOTE_AMOUNT
  )(tx);

  // 5-2. 고정된 USDC 양으로 BTC 시장가 매수 (Swap)
  // swapExactQuoteForBase: 고정된 양의 Quote Coin(USDC)을 주고 Base Coin(BTC)을 받음
  console.log(`${FIXED_QUOTE_AMOUNT} USDC로 BTC를 시장가 매수합니다...`);
  dbClient.swap.swapExactQuoteForBase({
    poolId: poolId,
    balanceManagerKey: BALANCE_MANAGER_KEY,
    quoteAmount: FIXED_QUOTE_AMOUNT,
    minBaseAmountOut: 0, // 시장가 주문이므로 최소 수량은 0으로 설정
  })(tx);

  // 6. 트랜잭션 서명 및 실행
  console.log('트랜잭션을 실행합니다...');
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  });

  console.log('DCA 매수 실행 완료!');
  console.log('Transaction Digest:', result.digest);
  console.log(`Sui Explorer에서 확인: https://suiscan.xyz/${ENV}/tx/${result.digest}`);

  return result;
}

// DCA 봇 실행
dcaBuyBtc().catch((error) => {
  console.error('DCA 실행 중 오류 발생:', error);
});
```

---

## 5. 핵심 코드 설명 및 샘플 코드와의 차이점

이 코드는 샘플 코드의 아이디어를 실제 동작 가능한 코드로 변환하면서 몇 가지 중요한 부분을 수정했습니다.

### 5.1. Balance Manager 생성 및 관리

-   **샘플 코드:** `BALANCE_MANAGER_ID`를 하드코딩된 상수로 가정했습니다.
-   **수정된 코드:** `getOrCreateBalanceManager` 함수를 추가했습니다.
    -   DeepBook에서 거래하려면 모든 자산이 `BalanceManager`라는 객체에 예치되어야 합니다.
    -   이 함수는 스크립트 첫 실행 시 `createAndShareBalanceManager` 트랜잭션을 통해 `BalanceManager`를 생성하고, 그 ID를 `balanceManager.json` 파일에 저장합니다.
    -   이후 실행 시에는 파일에 저장된 ID를 읽어와 재사용하므로, 매번 새로 생성할 필요가 없습니다.

### 5.2. 동적 Pool ID 조회

-   **샘플 코드:** `POOL_ID`를 하드코딩했습니다.
-   **수정된 코드:** `dbClient.pool.getPoolIdByAssets(BASE_COIN_TYPE, QUOTE_COIN_TYPE)`를 사용합니다.
    -   Base 코인(BTC)과 Quote 코인(USDC)의 전체 타입을 이용해 Pool의 ID를 동적으로 조회합니다.
    -   이 방식은 Pool ID가 변경되거나 다른 페어를 거래하고 싶을 때 코드의 유연성을 높여줍니다.

### 5.3. 정확한 스왑 함수 사용

-   **샘플 코드:** 존재하지 않는 `dbClient.pool.swapMarket` 함수를 사용했습니다.
-   **수정된 코드:** `dbClient.swap.swapExactQuoteForBase` 함수를 사용합니다.
    -   이 함수는 "정확한 양의 Quote 코인(USDC)을 지불하고, 그 대가로 가능한 많은 Base 코인(BTC)을 받는다"는 시장가 매수 로직에 정확히 부합합니다.
    -   `quoteAmount`에 지불할 USDC 금액을, `minBaseAmountOut`에는 0을 넣어 슬리피지(slippage)에 관계없이 시장가로 체결되도록 합니다.

### 5.4. 자금 예치 과정 명확화

-   **샘플 코드:** `depositIntoManager` 함수를 사용했지만, 어떤 코인을 예치하는지 명확하지 않았습니다.
-   **수정된 코드:** `dbClient.balanceManager.depositIntoManager`를 호출하여 `FIXED_QUOTE_AMOUNT` 만큼의 `QUOTE_COIN_TYPE`(USDC)을 `BalanceManager`에 예치하는 과정을 명시적으로 보여줍니다. SDK는 이 과정에서 필요한 코인을 지갑에서 자동으로 찾아 트랜잭션에 포함시킵니다.

---

## 6. 봇 실행 및 향후 개선 사항

### 봇 실행

아래 명령어로 작성한 DCA 봇을 실행할 수 있습니다.

```bash
npx ts-node dca-bot.ts
```

### 향후 개선 사항

-   **스케줄링:** `node-cron`과 같은 라이브러리를 사용하거나, 시스템의 `cron` 작업을 등록하여 이 스크립트를 주기적으로 (예: 매일, 매주) 실행하도록 자동화할 수 있습니다.
-   **에러 핸들링 강화:** RPC 통신 오류, 지갑 잔액 부족 등 다양한 예외 상황에 대한 처리 로직을 추가하여 봇의 안정성을 높일 수 있습니다.
-   **자산 인출:** 현재 코드는 매수한 BTC를 `BalanceManager`에 그대로 둡니다. 필요하다면 `dbClient.balanceManager.withdrawFromManager` 함수를 사용하여 매수한 자산을 개인 지갑으로 인출하는 로직을 추가할 수 있습니다.
-   **로깅:** 실행 결과, 오류, 매수 내역 등을 파일이나 데이터베이스에 기록하여 관리할 수 있습니다.
