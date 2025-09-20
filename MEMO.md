# Create a BalanceManager with custom ownerㅇ랑 Create a BalanceManager의 차이

✦ Create a BalanceManager와 Create a BalanceManager with custom owner의 주된 차이점은 누가 `BalanceManager`의 소유자(owner)가 되느냐에 있습니다.

- Create a BalanceManager (`new` 함수 사용):

  - 이 함수를 호출하여 BalanceManager를 생성하면, 생성 트랜잭션을 보낸 사람(sender)이 자동으로 소유자가 됩니다.

- Create a BalanceManager with custom owner (`new_with_owner` 함수 사용):

  - 이 함수를 사용하면 BalanceManager를 생성하면서 소유자를 별도로 지정할 수 있습니다. 즉, 트랜잭션을 보낸 사람이 아닌 다른 주소를 소유자로 설정할
    수 있습니다.

---

# how to create a new balance manager? and then How get balance manager key?

1. How to Create a New Balance Manager

To create a BalanceManager, you need to execute a programmable transaction that performs two steps:

1.  Call the new function in the balance_manager module.
2.  Share the object that the new function returns, making it a shared object that can be used by other contracts (like DeepBook pools).

Here is a TypeScript example using the @mysten/sui.js SDK to illustrate the process.

```
    1 import { TransactionBlock } from '@mysten/sui.js/transactions';
    2 import { SuiClient } from '@mysten/sui.js/client';
    3
    4 // Assume you have a configured client and a signer
    5 // const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
    6 // const signer = ...;
    7
    8 // Use the actual DeepBook V3 package ID for the network you are on
    9 const DEEPBOOK_PACKAGE_ID = "0xdee9...a785";
   10
   11 const txb = new TransactionBlock();
   12
   13 // Step 1: Create a new BalanceManager object by calling the `new` function.
   14 const [balanceManager] = txb.moveCall({
   15   target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::new`,
   16   arguments: [],
   17 });
   18
   19 // Step 2: Share the newly created BalanceManager so it can be used publicly.
   20 txb.moveCall({
   21   target: `0x2::transfer::public_share_object`,
   22   // The type argument is the full type of the BalanceManager
   23   typeArguments: [`${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManager`],
   24   arguments: [balanceManager],
   25 });
   26
   27 // Now, sign and execute this transaction block with your signer.
   28 // const result = await client.signAndExecuteTransactionBlock({ signer, transactionBlock: txb });
```

2. How to Get the Balance Manager "Key" (Object ID)

The "key" you are referring to is the Object ID of the shared BalanceManager. You get this ID from the response of the creation transaction you
just executed.

When the transaction is successful, the response will contain a list of newly created objects. The BalanceManager's Object ID will be in that list.

For example, if you inspect the result from the code snippet above, you would look for the created objects array in the transaction effects. The ID
will be a hexadecimal string starting with 0x.

This Object ID is the unique identifier for your `BalanceManager` and is what you will use to interact with it for depositing funds, trading, and
other operations.

---

# I already made balance manager. the object ID was '0x635c3863dea3c940981c4c9f64b977553bb6ad985b5345cdbf1839f7d39b4c05'. How to use this balance manager to start to trading in deepbook?

✦ Great, you have the most important component. Now, to start trading with your BalanceManager (0x635c...05), you need to follow these steps. The
entire trading process is typically done within a single programmable transaction block.

Here’s a breakdown of the steps and a code example of what the transaction looks like.

Step 1: Deposit Funds into your Balance Manager

Your BalanceManager is currently empty. You need to deposit the assets you want to trade (e.g., SUI and a stablecoin like USDC). You must do this
for each type of coin you plan to trade.

This example shows how to deposit a SUI coin into your BalanceManager.

```
    1 import { TransactionBlock } from '@mysten/sui.js/transactions';
    2
    3 const DEEPBOOK_PACKAGE_ID = "0xdee9...a785"; // Use the correct package ID for the network
    4 const BALANCE_MANAGER_ID = "0x635c3863dea3c940981c4c9f64b977553bb6ad985b5345cdbf1839f7d39b4c05";
    5 const SUI_COIN_TO_DEPOSIT_ID = "0x....."; // The object ID of a SUI coin object you own
    6
    7 const txb = new TransactionBlock();
    8
    9 // The coin you want to deposit. You might need to split coins to get the exact amount.
   10 const [coinToDeposit] = txb.splitCoins(txb.gas, [txb.pure(1000000000)]); // Example: 1 SUI
   11
   12 txb.moveCall({
   13     target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
   14     typeArguments: ['0x2::sui::SUI'], // The type of coin you are depositing
   15     arguments: [
   16         txb.object(BALANCE_MANAGER_ID), // Your BalanceManager object
   17         coinToDeposit,                  // The Coin object
   18     ],
   19 });
   20
   21 // Sign and execute this transaction.
   22 // After this, your BalanceManager will have a SUI balance.
   23 // Repeat for other assets (e.g., USDC).
```

Step 2: Find a Trading Pool

Trading happens on a specific pool object, which represents a trading pair (e.g., SUI/USDC). You need to find the Object ID of the pool you want to
trade on. These are usually published by the front-end application or can be found on a Sui block explorer.

Let's assume you found the SUI/USDC pool ID: 0xabc...def.

Step 3: Place a Trade Order

This is the main step and is done in a single transaction. You will:

1.  Generate a temporary TradeProof from your BalanceManager.
2.  Use that TradeProof to call place_limit_order on the pool.

This ensures that you prove ownership and sufficient funds at the moment of trading.

```
1 import { TransactionBlock } from '@mysten/sui.js/transactions';
2
3 const DEEPBOOK_PACKAGE_ID = "0xdee9...a785"; // Use the correct package ID
4 const BALANCE_MANAGER_ID = "0x635c3863dea3c940981c4c9f64b977553bb6ad985b5345cdbf1839f7d39b4c05";
5 const POOL_ID = "0xabc...def"; // The Object ID of the SUI/USDC pool
6 const CLOCK_OBJECT = "0x6"; // The shared Clock object, always 0x6
7
8 // The coin types for the pool (Base and Quote)
9 const BASE_COIN_TYPE = "0x2::sui::SUI";
10 const QUOTE_COIN_TYPE = "0x5d4b...::usdc::USDC"; // Example USDC type
11
12 const txb = new TransactionBlock();
13
14 // Step 3.1: Generate the TradeProof. This is only valid for this transaction.
15 const [tradeProof] = txb.moveCall({
16 target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
17 arguments: [txb.object(BALANCE_MANAGER_ID)],
18 });
19
20 // Step 3.2: Place the limit order on the pool
21 txb.moveCall({
22 target: `${DEEPBOOK_PACKAGE_ID}::pool::place_limit_order`,
23 typeArguments: [BASE_COIN_TYPE, QUOTE_COIN_TYPE],
24 arguments: [
25 txb.object(POOL_ID),
26 txb.object(BALANCE_MANAGER_ID),
27 tradeProof, // The proof you just generated
28 txb.pure(1000000000), // Quantity of base asset to trade (e.g., 1 SUI)
29 txb.pure(105000000), // Price (e.g., 10.5 USDC per SUI, considering decimals)
30 txb.pure(true), // true for bid (buy), false for ask (sell)
31 txb.pure(false), // self-matching prevention
32 txb.object(CLOCK_OBJECT),
33 ],
34 });
35
36 // Sign and execute this single transaction to place your order.
```

In summary, the workflow is:

1.  Deposit assets into your BalanceManager (one-time setup per asset).
2.  Create and execute a transaction that generates a TradeProof and immediately uses it to place_limit_order on a specific pool.

---

# 이렇게 데이터가 있을 때 baseCoin 이랑 quoteCoin이랑 무슨 차이야? 내가 뭐로 ㅂ주문이 가능한거야?

```
✦ baseCoin과 quoteCoin의 차이점과, 어떤 코인으로 주문할 수 있는지 설명해 드릴게요.

  1. baseCoin과 quoteCoin의 차이

  거래 페어(trading pair)는 항상 BASE/QUOTE 형식으로 표시됩니다.

   * `baseCoin` (기준 코인): 거래의 대상이 되는 자산입니다. 즉, 당신이 사거나 팔려는 물건에 해당합니다.
   * `quoteCoin` (상대 코인): baseCoin의 가격을 표시하는 데 사용되는 자산입니다. 즉, 물건값을 치르는 돈에 해당합니다.

  예시: `SUI_DBUSDC` 풀
   * baseCoin: 'SUI'
   * quoteCoin: 'DBUSDC'

  이 풀에서 가격은 "1 SUI를 사거나 팔 때 몇 DBUSDC가 필요한가?" 로 표시됩니다. 예를 들어 가격이 10.5라면, 1 SUI를 10.5 DBUSDC와 교환할 수 있다는
  의미입니다.

  2. 무엇으로 주문할 수 있나요?

  당신은 목록에 있는 어떤 풀에서든 주문을 할 수 있습니다. 하지만 주문을 하려면 거래에 필요한 코인을 당신의 `BalanceManager`에 미리 입금(deposit)해야
  합니다.

  예시: `SUI_DBUSDC` 풀에서 주문하기

   * SUI를 사고 싶을 때 (매수 주문):
       * SUI를 사기 위한 대금으로 DBUSDC를 지불해야 합니다.
       * 따라서 `DBUSDC`가 당신의 `BalanceManager`에 들어있어야 SUI 매수 주문을 할 수 있습니다.

   * SUI를 팔고 싶을 때 (매도 주문):
       * 팔려는 물건인 SUI를 가지고 있어야 합니다.
       * 따라서 `SUI`가 당신의 `BalanceManager`에 들어있어야 SUI 매도 주문을 할 수 있습니다.

  결론:
  SUI_DBUSDC 풀에서 거래하고 싶다면, SUI를 사기 위한 DBUSDC나 팔기 위한 SUI를 먼저 당신의 BalanceManager (0x635c...05)에 deposit 함수를 이용해
  입금해야 합니다. 다른 풀(DEEP_SUI, WAL_SUI 등)도 마찬가지의 원리가 적용됩니다.
```

---

# [account order map 코드의 목적](https://github.com/MystenLabs/ts-sdks/blob/main/packages/deepbook-v3/examples/accountOrderMap.ts)

코드의 전체적인 목적

이 코드는 특정 사용자(manager)가 DeepBook의 여러 거래 풀(pools)에 제출한 미체결 주문(open orders) 현황을 조회하고, 가격대별로 집계하여 보여주는
스크립트입니다.

전체 시장의 모든 주문을 보여주는 것이 아니라, 오직 지정된 한 명의 사용자(`manager`)가 올린 주문들만을 모아서 개인화된 오더북(order book) 형태로
정리하는 역할을 합니다.

단계별 상세 설명

코드는 for (const pool of pools) 루프를 통해 각 거래 풀에 대해 다음 과정을 반복합니다.

1.  사용자의 미체결 주문 ID 목록 조회

1 const orders = await dbClient.accountOpenOrders(pool, manager);
_ DeepBook V3 문서의 query-the-pool.mdx에 따르면, account_open_orders 함수는 특정 풀(pool)에서 특정 BalanceManager(manager)가 소유한 모든 미체결
주문의 ID 목록을 반환합니다.
_ 이 코드는 바로 그 기능을 사용하여, 현재 풀에서 manager가 제출한 모든 주문 ID를 가져옵니다.

2.  주문 상세 정보 조회 및 잔량 계산

1 for (const orderId of orders) {
2 const order = await dbClient.getOrderNormalized(pool, orderId);
3 // ...
4 remainingQuantity = Number(order.quantity) - Number(order.filled_quantity);
5 }
_ 가져온 각 주문 ID(orderId)를 사용해 getOrderNormalized 함수로 해당 주문의 상세 정보(가격, 전체 수량, 체결된 수량, 매수/매도 여부 등)를
가져옵니다.
_ remainingQuantity는 전체 주문 수량 - 이미 체결된 수량을 계산하여, 아직 체결되지 않고 남아있는 주문 잔량을 구합니다.

3.  가격대별 주문 수량 집계

1 const orderMap = order.isBid ? bidOrdersMap : askOrdersMap;
2 const orderPrice = Number(order.normalized_price);
3 const existingQuantity = orderMap.get(orderPrice) || 0;
4 orderMap.set(orderPrice, existingQuantity + remainingQuantity);
_ 주문이 매수 주문(isBid가 true)인지 매도 주문인지에 따라 bidOrdersMap(매수 주문 맵) 또는 askOrdersMap(매도 주문 맵)에 기록합니다.
_ 같은 가격(orderPrice)에 여러 개의 주문이 있을 수 있으므로, Map을 사용해 동일한 가격대의 주문 잔량을 모두 합산합니다. \* 예를 들어, 10.5 USDC 가격에 1 SUI를 매수하는 주문과 2 SUI를 매수하는 주문 두 개가 있다면, bidOrdersMap에는 [10.5, 3] 과 같이 기록됩니다.

4.  정렬 및 출력

1 const sortedBidOrders = Array.from(bidOrdersMap.entries()).sort((a, b) => b[0] - a[0]);
2 const sortedAskOrders = Array.from(askOrdersMap.entries()).sort((a, b) => a[0] - b[0]);
3
4 console.log(`${pool} bid orders:`, sortedBidOrders);
5 console.log(`${pool} ask orders:`, sortedAskOrders);
_ 집계가 끝나면, 일반적인 오더북 형식에 맞게 정렬합니다.
_ 매수(bid) 주문: 높은 가격이 우선이므로 가격을 기준으로 내림차순 정렬합니다.
_ 매도(ask) 주문: 낮은 가격이 우선이므로 가격을 기준으로 오름차순 정렬합니다.
_ 마지막으로, 해당 풀에 대한 사용자의 매수/매도 주문 현황을 콘솔에 출력합니다.

결론

이 스크립트는 DeepBook V3의 조회(Query) 기능을 활용하여, 특정 사용자가 여러 마켓에 걸쳐 어떤 가격에 얼마나 많은 매수/매도 주문을 걸어두었는지
한눈에 파악할 수 있도록 개인화된 데이터를 생성하고 보여주는 유용한 도구입니다.
