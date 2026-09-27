# Piano Rhythm Coach

A browser-based piano rhythm trainer. It plays a metronome, listens for notes through your microphone, and shows how closely your playing matches the beat. It also offers latency calibration, a timing display, and playback of your latest practice recording.

**Try it:** https://fragrant-union-8a3e.eddylaucheukwa.workers.dev/

## How to use

1. Open the live link in a current browser and press **ALLOW MICROPHONE**. Allow microphone access when prompted. Headphones help prevent the metronome from being picked up by the microphone.
2. Set **TEMPO** with the dial (40–180 BPM), **RHYTHM** with +/− (1–4 notes per beat), and **NOTES** with the vertical wheel (1–100 notes). Move **SENSITIVITY** if notes are missed or background sound is detected.
3. For more accurate timing, press **ADJUST LATENCY** after connecting the microphone. Listen to the four-beat count-in, then play 15 notes with the clicks. Press **START / APPLY** to save a successful calibration or **STOP / RETRY** to try again. Calibration is optional and is saved in this browser.
4. Press **START** to practise. After the four-beat count-in, play the chosen number of notes. The monitor shows timing and accuracy. Press **STOP** when finished, then use **PLAYBACK** to hear the latest recording once it is ready.

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

## License

MIT. See [LICENSE](LICENSE).
