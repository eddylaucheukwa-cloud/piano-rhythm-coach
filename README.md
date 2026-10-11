# Piano Rhythm Coach

A browser-based piano rhythm trainer. It plays a metronome, listens for notes through your microphone, and shows how closely your playing matches the beat. It also offers latency calibration, a timing display, and playback of your latest practice recording.

**Try it:** https://fragrant-union-8a3e.eddylaucheukwa.workers.dev/

## How to use

1. Open the live link in a current browser and press **ALLOW MICROPHONE**. Allow microphone access when prompted. Headphones help prevent the metronome from being picked up by the microphone.
2. Set **TEMPO** with the dial (40–180 BPM). In practice mode, adjusting the dial or using its arrow keys temporarily enlarges BPM on the monitor; the chart returns 0.8 seconds after you finish. Set **RHYTHM** with +/− (1–4 notes per beat), and **NOTES** with the vertical wheel (1–100 notes). Move **SENSITIVITY** if notes are missed or background sound is detected.
3. For more accurate timing, press **ADJUST LATENCY** after connecting the microphone. Listen to the four-beat count-in, then play 15 notes with the clicks. Press **START / APPLY** to save a successful calibration or **STOP / RETRY** to try again. Calibration is optional and is saved in this browser.
4. Press **START** to practise. After the four-beat count-in, play the chosen number of notes. The monitor shows timing and accuracy. Press **STOP** when finished, then use **PLAYBACK** to hear the latest recording once it is ready.
5. Swipe the title left to enter **TEST MODE**. After the four count-in clicks, keep the rhythm without clicks or a live graph. It stops recording and shows the graph once all scheduled notes have been assessed. Swipe right to return to practice mode.
6. Swipe left once more from TEST MODE to enter **PHASING MODE**. The monitor shows both dynamics (upper curve) and timing (lower dots), with separate TIME and SHAPE results. Set at least 5 NOTES. For a compensated SHAPE score, press **SET LEVEL REFERENCE**, then play the whole scale with an even touch after four count-in beats. Keep the same microphone position. The reference accepts at least 70% valid notes (minimum 5), distributed across the whole phrase; missing or clipped positions stay uncalibrated. After saving a reference, press **START** and play the same notes soft–loud–soft. Recording stops automatically when every scheduled note is assessed; **PLAYBACK** replays it. Reset the reference when you change the scale, microphone placement, TEMPO, RHYTHM or NOTES.
7. For the hidden **PLAY MODE**, enter phasing mode and swipe the title left three more times. Each game starts with four count-in clicks at 60 BPM. The four digits tell you how many evenly spaced notes to play on each beat: `2341` means 2, 3, 4, then 1 note. Each loop gets a random pattern; **NEXT** previews the upcoming pattern, and the current beat is highlighted. After each four-beat pattern, rest for two buffer beats; the large digits immediately show the next pattern so you can prepare. Yellow means early or late notes, red means a missed note, and bright green means every note in that beat was accurate. Every four complete loops adds 5 BPM at the next loop, after its buffer, while the metronome continues. The RHYTHM and NOTES controls keep their normal appearance but cannot change the game's settings. Press **STOP** to finish, review the graph, and play the recording. Swipe right to return to phasing mode, then test mode. Arrow keys on the focused title also work.

The app runs in your browser. Microphone permission is required for note detection and recording; recordings are available only during the current page session. Use the HTTPS live link or `localhost` for microphone access.

## Detection and dynamics

Note detection uses the original animation-frame analyser, spectral-flux thresholds, peak ratio and volume gate from the version before PHASING. PHASING additionally records the strongest RMS level from the three latest frames without changing onset decisions. Calibrations made with the reverted newer detector are cleared when connecting; run **ADJUST LATENCY** again if necessary. All modes share the same physical console layout; PHASING instructions stay inside the monitor, and **ADJUST LATENCY** becomes **SET LEVEL REFERENCE** in PHASING, reusing the same physical button.

A level reference compensates the measured gain of each position in the same note sequence; it does not identify pitches. SHAPE is a relative curve-correlation guide, not a measurement of finger force or MIDI velocity. SHAPE needs at least 70% usable practice notes, at least 70% of the reference positions paired (minimum 5), coverage of the beginning, middle and end, and 3 dB of contrast. Missing/clipped notes are excluded without interpolation; reported microphone auto gain prevents grading. START can display raw dynamics without a reference; SHAPE remains unavailable because key-dependent gain has not been compensated. TIME is the on-beat rate, not the detection rate. Keep the scale, touch reference, microphone, tempo and pedal use consistent; hardware gain, room sound and overlapping notes can still affect results. No new real-piano accuracy percentage is claimed from synthetic tests.

For temporary diagnostics, **EXPORT TEST** appears inside the PHASING monitor after a completed or stopped reference/practice session, including rejected references. It downloads a readable `.txt` report with full JSON: separate capture/timing rates, each note's timing/level/reference/exclusion, mic settings, and detector-frame gates. The latest 12,000 frames per session are retained; practice reports include the reference attempt from the same settings. Files are downloaded locally, contain no recorded audio or microphone device IDs, and are not automatically sent anywhere. Upload the file to this chat for analysis.

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
2. 旋轉 **TEMPO** 設定速度；一般模式調整旋鈕或使用方向鍵時，螢幕會暫時放大 BPM，停止調整約 0.8 秒後恢復圖表；用 **RHYTHM** 的 +/− 設定每拍音符數；用 **NOTES** 的直立滾輪設定練習音符數。如偵測過少或誤收雜音，可調整 **SENSITIVITY**。
3. 如需校正延遲，連接咪高峰後按 **ADJUST LATENCY**。先聽四拍預備拍，再跟隨節拍彈奏 15 個音。成功後按 **START / APPLY** 儲存，或按 **STOP / RETRY** 重試。校正並非必需，設定會儲存在目前瀏覽器。
4. 按 **START** 開始。四拍預備拍後按設定數量彈奏，螢幕會顯示時間偏差及準確度。完成後按 **STOP**；錄音準備好後可按 **PLAYBACK** 重聽。
5. 標題左滑進入 **TEST MODE**。四拍預備後節拍聲及即時圖表會隱藏；所有預定音符判定完成後，自動停止錄音並顯示圖表。右滑返回一般模式。
6. 在 TEST MODE 再左滑一次，進入 **PHASING MODE**。螢幕上方顯示強弱曲線，下方顯示節奏偏差，TIME 和 SHAPE 分別表示準拍比例及曲線貼合度。NOTES 至少設定 5 個音。如需補償琴鍵收音差異及計算 SHAPE，可按 **SET LEVEL REFERENCE**，四拍預備後以相同力度完整彈奏一次音階，建立收音基準。至少 70% 的音符有效（最少 5 個）且涵蓋整段開頭、中間和結尾即可儲存；漏音或失真的位置保留空缺，不會補造音量。咪高峰位置保持固定，再按 **START**，彈奏同一組音符，力度由弱漸強、再漸弱。所有音符判定後自動停止錄音，可按 **PLAYBACK** 重聽。更換音階、移動咪高峰，或調整 TEMPO、RHYTHM、NOTES 後，需重新建立收音基準。
7. 在 PHASING MODE 再左滑三次，就會進入彩蛋 **PLAY MODE**。每次遊戲從 60 BPM、四拍預備開始。四個數字代表四拍各要平均彈奏多少個音符，例如 `2341` 是依次彈 2、3、4、1 下。每個循環都會產生隨機組合，**NEXT** 提前顯示下一組，並突出顯示目前拍子。每輪四拍演奏後有兩拍緩衝，大字立即切換到下一組，讓你提前熟悉：提早或延遲亮黃燈，漏彈亮紅燈，整拍音符準確則亮綠燈，三種顏色亮度一致。每完成四輪，在緩衝後的下一輪加 5 BPM，節拍器持續播放。RHYTHM 和 NOTES 控制器保留正常外觀，但遊戲期間操作不會改變設定。按 **STOP** 結束、查看圖表和重聽錄音；右滑先返回 PHASING MODE，再返回 TEST MODE。也可以聚焦標題後用方向鍵操作。

音符偵測已回復加入 PHASING 前的版本，PHASING 仍會額外記錄音量以顯示強弱曲線。新版偵測器的延遲校正會清除，必要時請重新按 **ADJUST LATENCY** 校正。所有模式維持相同機身及實體控制位置，PHASING 提示放在螢幕內，**ADJUST LATENCY** 在 PHASING 直接切換成 **SET LEVEL REFERENCE**，沿用同一個按鈕。收音基準只補償同一音符順序中的音量差異，不能識別是否彈了相同音高，也不代表真正的按鍵力度。SHAPE 是相對曲線指標；無基準、收音失真或咪高峰自動調整音量時不會評分。若改變音階、咪高峰位置或踏板習慣，請重新建立基準。

## License

MIT. See [LICENSE](LICENSE).

在 PHASING 完成或停止基準／練習後，可按螢幕內的暫時按鈕 **EXPORT TEST** 下載文字診斷報告，即使基準被拒絕也能輸出。報告包含逐音符結果、收音音量、時間偏差、漏音／未有基準／失真等排除原因，以及每幀偵測門檻判斷；TIME 準拍率與偵測率分開列出。每次最多保留最近 12,000 幀，練習報告亦包含相同設定的基準錄製紀錄。檔案不含錄音或咪高峰裝置 ID，不會自動上傳；你可把 `.txt` 傳到對話供分析。不設定基準仍可按 START 看未補償的強弱走勢，但不會有 SHAPE 分數。
