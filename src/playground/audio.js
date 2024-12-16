import audioFile1 from "../assets/audio/r2d2_talk.mp3";
import audioFile2 from "../assets/audio/synth_melody.mp3";
import audioFile3 from "../assets/audio/theremin_tone.mp3";

// Audio management and processing related codes
export function initAudio() {
  // Audio initialization code
  
}

export function setupAudioEvents() {
  // Audio event listeners
}

// record native microphone input and do further audio processing on each audio buffer using the given callback functions
function startMicRecordStream() {
    if (navigator.mediaDevices.getUserMedia) {
      console.log("Initializing audio...");
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(startAudioProcessingStream)
        .catch(function (message) {
          throw "Could not access microphone - " + message;
        });
    } else {
      throw "Could not access microphone - getUserMedia not available";
    }
  }
  
  function startAudioProcessingStream(stream) {
    gumStream = stream;
    if (gumStream.active) {
      if (audioCtx.state == "closed") {
        audioCtx = new AudioContext();
      }
      else if (audioCtx.state == "suspended") {
        audioCtx.resume();
      }
  
      mic = audioCtx.createMediaStreamSource(gumStream);
      gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
  
      let codeForProcessorModule = ["https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js",
        "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-extractor.umd.js",
        "https://raw.githack.com/MTG/essentia.js/master/examples/demos/melspectrogram-rt/melspectrogram-processor.js",
        "https://unpkg.com/ringbuf.js@0.1.0/dist/index.js"];
  
      // inject Essentia.js code into AudioWorkletGlobalScope context, then setup audio graph and start animation
      URLFromFiles(codeForProcessorModule)
        .then((concatenatedCode) => {
          audioCtx.audioWorklet.addModule(concatenatedCode)
            .then(setupAudioGraphStream)
            .catch(function moduleLoadRejected(msg) {
              console.log(`There was a problem loading the AudioWorklet module code: \n ${msg}`);
            });
        })
        .catch((msg) => {
          console.log(`There was a problem retrieving the AudioWorklet module code: \n ${msg}`);
        })
      //  // set button to stop
      recordButton.classList.add("recording");
      recordButton.innerHTML = "Stop";
      recordButton.classList.add("bg-emerald-200");
      recordButton.disabled = false;
    } else {
      throw "Mic stream not active";
    }
  }
  function startAudioProcessingMediaElt() {
    if (audioCtx.state == "closed") {
      audioCtx = new AudioContext();
    }
    else if (audioCtx.state == "suspended") {
      audioCtx.resume();
    }
  
    source = audioCtx.createMediaElementSource(player);
    gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    let codeForProcessorModule = ["https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js",
      "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-extractor.umd.js",
      "https://raw.githack.com/MTG/essentia.js/master/examples/demos/melspectrogram-rt/melspectrogram-processor.js",
      "https://unpkg.com/ringbuf.js@0.1.0/dist/index.js"];
  
    // inject Essentia.js code into AudioWorkletGlobalScope context, then setup audio graph and start animation
    URLFromFiles(codeForProcessorModule)
      .then((concatenatedCode) => {
        audioCtx.audioWorklet.addModule(concatenatedCode)
          .then(setupAudioGraphMediaElt)
          .catch(function moduleLoadRejected(msg) {
            console.log(`There was a problem loading the AudioWorklet module code: \n ${msg}`);
          });
      })
      .catch((msg) => {
        console.log(`There was a problem retrieving the AudioWorklet module code: \n ${msg}`);
      })
  }
  function stopMicRecordStream() {
    // stop mic stream
    gumStream.getAudioTracks().forEach(function (track) {
      track.stop();
      gumStream.removeTrack(track);
    });
  
    audioCtx.close().then(function () {
      // manage button state
      recordButton.classList.remove("recording");
      recordButton.innerHTML = 'Record';
  
      // disconnect nodes
      mic.disconnect();
      melspectrogramNode.disconnect();
      gain.disconnect();
      mic = undefined;
      melspectrogramNode = undefined;
      gain = undefined;
  
      console.log("Stopped recording ...");
    });
  }
  function stopAudioProcessingMediaElt() {
    player.pause();
    audioCtx.close().then(function () {
      // disconnect nodes
      source.disconnect();
      melspectrogramNode.disconnect();
      source = undefined;
      melspectrogramNode = undefined;
    });
  }
  function setupAudioGraphStream() {
    // increase buffer size in case of glitches
    let sab = exports.RingBuffer.getStorageForCapacity(melNumBands * 42, Float32Array);
    let rb = new exports.RingBuffer(sab, Float32Array);
    audioReader = new exports.AudioReader(rb);
  
    melspectrogramNode = new AudioWorkletNode(audioCtx, 'melspectrogram-processor', {
      processorOptions: {
        bufferSize: bufferSize,
        hopSize: hopSize,
        melNumBands: melNumBands,
        sampleRate: audioCtx.sampleRate,
      }
    });
  
    try {
      melspectrogramNode.port.postMessage({
        sab: sab,
      });
    } catch (_) {
      alert("No SharedArrayBuffer transfer support, try another browser.");
      recordButton.disabled = true;
      return;
    }
    recording = recordButton.classList.contains("recording");
    mic.connect(melspectrogramNode);
    melspectrogramNode.connect(gain);
    gain.connect(audioCtx.destination);
  
  }
  
  function setupAudioGraphMediaElt() {
    // increase buffer size in case of glitches
    let sab = exports.RingBuffer.getStorageForCapacity(melNumBands * 18, Float32Array);
    let rb = new exports.RingBuffer(sab, Float32Array);
    audioReader = new exports.AudioReader(rb);
    melspectrogramNode = new AudioWorkletNode(audioCtx, 'melspectrogram-processor', {
      processorOptions: {
        bufferSize: 1024,
        hopSize: 512,
        melNumBands: melNumBands,
        sampleRate: audioCtx.sampleRate,
      }
    });
    // The AudioWorklet node causes cracking noises during playback so we 
    // connect it with a gain node to avoid this.
    try {
      melspectrogramNode.port.postMessage({
        sab: sab,
      });
    } catch (_) {
      alert("No SharedArrayBuffer transfer support, try another browser.");
      return;
    }
    // connect source to destination for playback
    source.connect(audioCtx.destination);
    // connect source to AudioWorklet node for feature extraction
    source.connect(melspectrogramNode);
    melspectrogramNode.connect(gain);
    gain.connect(audioCtx.destination);
  }
  