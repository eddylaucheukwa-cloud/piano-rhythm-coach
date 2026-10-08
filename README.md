# Piano Rhythm Coach

A browser-based piano rhythm trainer. It plays a metronome, listens for notes through your microphone, and shows how closely your playing matches the beat. It also offers latency calibration, a timing display, and playback of your latest practice recording.

**Try it:** https://fragrant-union-8a3e.eddylaucheukwa.workers.dev/

## How to use

1. Open the live link in a current browser and press **ALLOW MICROPHONE**. Allow microphone access when prompted. Headphones help prevent the metronome from being picked up by the microphone.
2. Set **TEMPO** with the dial (40–180 BPM), **RHYTHM** with +/− (1–4 notes per beat), and **NOTES** with the vertical wheel (1–100 notes). Move **SENSITIVITY** if notes are missed or background sound is detected.
3. For more accurate timing, press **ADJUST LATENCY** after connecting the microphone. Listen to the four-beat count-in, then play 15 notes with the clicks. Press **START / APPLY** to save a successful calibration or **STOP / RETRY** to try again. Calibration is optional and is saved in this browser.
4. Press **START** to practise. After the four-beat count-in, play the chosen number of notes. The monitor shows timing and accuracy. Press **STOP** when finished, then use **PLAYBACK** to hear the latest recording once it is ready.
5. Swipe the title left to enter **TEST MODE**. After the four count-in clicks, keep the rhythm without clicks or a live graph. It stops recording and shows the graph once all scheduled notes have been assessed. Swipe right to return to practice mode.
6. For the hidden **PLAY MODE**, enter test mode and swipe the title left three more times. Each game starts with four count-in clicks at 60 BPM. The four digits tell you how many evenly spaced notes to play on each beat: `2341` means 2, 3, 4, then 1 note. Each loop gets a random pattern; **NEXT** previews the upcoming pattern, and the current beat is highlighted. After each four-beat pattern, rest for two buffer beats; the large digits immediately show the next pattern so you can prepare. Yellow means early or late notes, red means a missed note, and bright green means every note in that beat was accurate. Every four complete loops adds 5 BPM at the next loop, after its buffer, while the metronome continues. The RHYTHM and NOTES controls keep their normal appearance but cannot change the game's settings. Press **STOP** to finish, review the graph, and play the recording. Swipe right to return to test mode. Arrow keys on the focused title also work.

The app runs in your browser. Microphone permission is required for note detection and recording; recordings are available only during the current page session. Use the HTTPS live link or `localhost` for microphone access.

## Run locally

This is a static HTML, CSS, and JavaScript app. No build step or package installation is needed.

```sh
python -m http.server 8765
```

Open http://localhost:8765/ in your browser. To run the included regression tests, install Node.js and run:

```sh
node --test tests/script.test.cjs
```

## Project files

- `index.html` — interface and controls
- `style.css` — responsive hardware-inspired design
- `script.js` — microphone, metronome, calibration, practice, and recording
- `mixer-ui.js` — dial, slider, transport, and mobile interaction
- `tests/script.test.cjs` — focused behaviour tests

## 中文使用說明

Piano Rhythm Coach 是在瀏覽器運作的鋼琴節奏練習工具。它會播放節拍、透過咪高峰偵測彈奏，並在螢幕顯示節奏偏差及準確度。

1. 開啟[線上版本](https://fragrant-union-8a3e.eddylaucheukwa.workers.dev/)，按 **ALLOW MICROPHONE** 並允許使用咪高峰。建議戴耳機，避免節拍聲被咪高峰收進去。
2. 旋轉 **TEMPO** 設定速度；用 **RHYTHM** 的 +/− 設定每拍音符數；用 **NOTES** 的直立滾輪設定練習音符數。如偵測過少或誤收雜音，可調整 **SENSITIVITY**。
3. 如需校正延遲，連接咪高峰後按 **ADJUST LATENCY**。先聽四拍預備拍，再跟隨節拍彈奏 15 個音。成功後按 **START / APPLY** 儲存，或按 **STOP / RETRY** 重試。校正並非必需，設定會儲存在目前瀏覽器。
4. 按 **START** 開始。四拍預備拍後按設定數量彈奏，螢幕會顯示時間偏差及準確度。完成後按 **STOP**；錄音準備好後可按 **PLAYBACK** 重聽。
5. 標題左滑進入 **TEST MODE**。四拍預備後節拍聲及即時圖表會隱藏；所有預定音符判定完成後，自動停止錄音並顯示圖表。右滑返回一般模式。
6. 在 TEST MODE 再左滑三次，就會進入彩蛋 **PLAY MODE**。每次遊戲從 60 BPM、四拍預備開始。四個數字代表四拍各要平均彈奏多少個音符，例如 `2341` 是依次彈 2、3、4、1 下。每個循環都會產生隨機組合，**NEXT** 提前顯示下一組，並突出顯示目前拍子。每輪四拍演奏後有兩拍緩衝，大字立即切換到下一組，讓你提前熟悉：提早或延遲亮黃燈，漏彈亮紅燈，整拍音符準確則亮綠燈，三種顏色亮度一致。每完成四輪，在緩衝後的下一輪加 5 BPM，節拍器持續播放。RHYTHM 和 NOTES 控制器保留正常外觀，但遊戲期間操作不會改變設定。按 **STOP** 結束、查看圖表和重聽錄音；右滑返回 TEST MODE。也可以聚焦標題後用方向鍵操作。

## License

MIT. See [LICENSE](LICENSE).
