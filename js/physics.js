/* -------------------------------------------------------------
 * Chrome Wallpaper - Physics & Collision Resolution Module
 * ------------------------------------------------------------- */

import { appState, GRID_COLS, GRID_ROWS } from './state.js';

// 2つのウィジェットが重なっているか判定
export function isWidgetsColliding(w1, w2) {
  return !(
    w1.gridX + w1.gridW <= w2.gridX ||
    w2.gridX + w2.gridW <= w1.gridX ||
    w1.gridY + w1.gridH <= w2.gridY ||
    w2.gridY + w2.gridH <= w1.gridY
  );
}

// 画面全体の空きグリッドポジションを全探索 (W x H サイズに対応)
export function findFreeGridPosition(w, h, excludeIds = []) {
  const widgets = appState.currentSettings.widgets;
  const gridWidthLimit = GRID_COLS;
  const gridHeightLimit = GRID_ROWS;

  for (let y = 0; y <= gridHeightLimit - h; y++) {
    for (let x = 0; x <= gridWidthLimit - w; x++) {
      const tempPos = { gridX: x, gridY: y, gridW: w, gridH: h };
      const hasCollision = widgets.some(widget => {
        if (excludeIds.includes(widget.id)) return false;
        return isWidgetsColliding(tempPos, widget);
      });
      if (!hasCollision) {
        return { x, y };
      }
    }
  }
  // 空きがない場合の最悪ケースのフォールバック
  return { x: 0, y: 0 };
}

// ウィジェット同士の位置を入れ替える (iPhone風スワップ・リアルタイムローリング追従仕様)
export function swapWidgets(movedWidget, targetX, targetY, dragStartPos) {
  const tempPos = { gridX: targetX, gridY: targetY, gridW: movedWidget.gridW, gridH: movedWidget.gridH };
  
  // 移動先に重なる既存のウィジェットを検出 (移動対象自身は除く)
  const collidingWidget = appState.currentSettings.widgets.find(w => w.id !== movedWidget.id && isWidgetsColliding(tempPos, w));

  if (collidingWidget) {
    // 衝突された相手が元々占有していた座標を退避
    const oldX = collidingWidget.gridX;
    const oldY = collidingWidget.gridY;

    // 衝突された相手を、移動ウィジェットの「直前の空き座標（元の位置）」へ瞬間移動させる
    collidingWidget.gridX = dragStartPos.x;
    collidingWidget.gridY = dragStartPos.y;

    // ★重要：次の連続スワップに備えて、ドラッグ元の空き座標を「衝突相手が元いた座標」に更新（ローリング）
    dragStartPos.x = oldX;
    dragStartPos.y = oldY;

    // スワップされたウィジェットが、スワップ先で別のウィジェットと二次衝突した場合は
    // そのスワップされた側を起点として全方向の自動押し退けを再帰解決する
    resolveWidgetCollisions(collidingWidget.id);
  }
}

// 衝突が発生しているウィジェットを、全方向(上下左右)で最も移動距離が少なくて済む位置へ玉突き押し退け
export function resolveWidgetCollisions(movedWidgetId) {
  let changed = true;
  let iterations = 0;
  const maxIterations = 50; // 無限ループガード
  const gridWidthLimit = GRID_COLS;
  const gridHeightLimit = GRID_ROWS;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (let i = 0; i < appState.currentSettings.widgets.length; i++) {
      const w1 = appState.currentSettings.widgets[i];

      for (let j = 0; j < appState.currentSettings.widgets.length; j++) {
        if (i === j) continue;
        const w2 = appState.currentSettings.widgets[j];

        // 2つのウィジェットが衝突している場合
        if (isWidgetsColliding(w1, w2)) {
          let target = w2;
          let obstacle = w1;

          // 最近動かされたウィジェット(movedWidgetId)を「固定物」とみなし、他方を動かす
          if (w2.id === movedWidgetId) {
            target = w1;
            obstacle = w2;
          }

          // 上下左右に避けるために必要なズレ（シフト量）を計算
          const shiftUp = (target.gridY + target.gridH) - obstacle.gridY;
          const shiftDown = (obstacle.gridY + obstacle.gridH) - target.gridY;
          const shiftLeft = (target.gridX + target.gridW) - obstacle.gridX;
          const shiftRight = (obstacle.gridX + obstacle.gridW) - target.gridX;

          const candidates = [];

          // 画面外にはみ出さない候補だけを集める
          if (target.gridY - shiftUp >= 0) {
            candidates.push({ dir: 'up', dist: shiftUp, x: target.gridX, y: target.gridY - shiftUp });
          }
          if (target.gridY + shiftDown + target.gridH <= gridHeightLimit) {
            candidates.push({ dir: 'down', dist: shiftDown, x: target.gridX, y: target.gridY + shiftDown });
          }
          if (target.gridX - shiftLeft >= 0) {
            candidates.push({ dir: 'left', dist: shiftLeft, x: target.gridX - shiftLeft, y: target.gridY });
          }
          if (target.gridX + shiftRight + target.gridW <= gridWidthLimit) {
            candidates.push({ dir: 'right', dist: shiftRight, x: target.gridX + shiftRight, y: target.gridY });
          }

          // 逃げ道がある場合、移動距離が最も小さくて済む方向を選ぶ
          if (candidates.length > 0) {
            candidates.sort((a, b) => a.dist - b.dist);
            const best = candidates[0];
            target.gridX = best.x;
            target.gridY = best.y;
          } else {
            // どの方向にも逃げ場がない場合の最終手段として、空きスペースを全探索
            const freePos = findFreeGridPosition(target.gridW, target.gridH, [target.id]);
            target.gridX = freePos.x;
            target.gridY = freePos.y;
          }

          changed = true;
        }
      }
    }
  }
}
