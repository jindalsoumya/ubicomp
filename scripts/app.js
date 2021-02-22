// set up basic variables for app
const record = document.querySelector('.record');
const stop = document.querySelector('.stop');
const soundClips = document.querySelector('.sound-clips');
const amplitudeCanvas = document.querySelector('.visualizer');
const mainSection = document.querySelector('.main-controls');
let audioCtx;
const amplitudeCanvasCtx = amplitudeCanvas.getContext("2d");
var rec_raw;
var rec_filtered;


const audioInputSelect = document.querySelector('select#audioSource');
const selectors = [audioInputSelect];

function gotDevices(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
  const values = selectors.map(select => select.value);
  selectors.forEach(select => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  });
  for (let i = 0; i !== deviceInfos.length; ++i) {
    const deviceInfo = deviceInfos[i];
    const option = document.createElement('option');
    option.value = deviceInfo.deviceId;
    if (deviceInfo.kind === 'audioinput') {
      option.text = deviceInfo.label || `microphone ${audioInputSelect.length + 1}`;
      audioInputSelect.appendChild(option);
    }
  }
  selectors.forEach((select, selectorIndex) => {
    if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
      select.value = values[selectorIndex];
    }
  });
}

function visualize(stream) {
  if(!audioCtx) {
    audioCtx = new AudioContext();
  }

  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  let feedForward = [1, 4, 6, 4, 1];
  let feedBack = [1, -3.89515962872624, 5.69093969755989, -3.69623536934508,0.900457760845518];
  const iirfilter = audioCtx.createIIRFilter(feedforward=feedForward, feedback=feedBack);
  var gainNode = audioCtx.createGain();
  gainNode.gain.value = 1E-05;
  var max_amplification = 5E-04;

  analyser.fftSize = 2048;
  let amplitudeBufferLength = analyser.fftSize;
  let frequencyBufferLength = analyser.frequencyBinCount;
  let amplitudeData = new Uint8Array(amplitudeBufferLength);
  let frequencyData = new Uint8Array(frequencyBufferLength);

  
  amplitudeCanvas.style.width = '100%';
  amplitudeCanvas.width  = amplitudeCanvas.offsetWidth;
  const amplitudeCanvasCtx = amplitudeCanvas.getContext('2d');
  
  const GRAPH_WINDOW_LENGTH = 120000;
  let graphWindowData = new Uint8Array(GRAPH_WINDOW_LENGTH);
  let graphWindowStart = 0;

  // source.connect(analyser);

  source.connect(iirfilter);
  iirfilter.connect(gainNode);
  gainNode.connect(analyser);

  rec_raw = new WebAudioRecorder(source, {workerDir: "scripts/lib/", encoding: "wav", numChannels: 2});
  rec_raw.onComplete = function(recorder, blob) {
      createDownloadLink(blob,recorder.encoding, "raw")
  }

  rec_filtered = new WebAudioRecorder(gainNode, {workerDir: "scripts/lib/", encoding: "wav", numChannels: 2});
  

  rec_filtered.onComplete = function(recorder, blob) {
      createDownloadLink(blob,recorder.encoding, "filtered")
      //calculate BPM
      prepare(blob);
  }

  rec_raw.setOptions({
      timeLimit:60,
      bufferSize: 16384,
      encodeAfterRecord:true,
        ogg: {quality: 0.5},
        mp3: {bitRate: 160}
      });

  rec_filtered.setOptions({
      timeLimit:60,
      bufferSize: 16384,
      encodeAfterRecord:true,
        ogg: {quality: 0.5},
        mp3: {bitRate: 160}
      });


  draw();

  function draw() {
    requestAnimationFrame(draw);

    analyser.getByteTimeDomainData(amplitudeData);
    
    const offset = GRAPH_WINDOW_LENGTH - graphWindowStart;
    graphWindowData.set(amplitudeData.slice(0, offset), graphWindowStart);
    graphWindowData.set(amplitudeData.slice(offset), 0);
    graphWindowStart = (graphWindowStart + amplitudeBufferLength) % GRAPH_WINDOW_LENGTH;

    drawAmplitudeGraph();
    // drawFrequencyGraph();
    max_amplitude = Math.max.apply(Math, amplitudeData);
    document.getElementById('volume').addEventListener('change', function() {
        max_amplification = this.value;
    });
    auto_gain = max_amplification/max_amplitude;
    gainNode.gain.value = auto_gain;

  }

  function drawAmplitudeGraph() {
    amplitudeCanvasCtx.fillStyle = 'rgb(0, 0, 0)';
    amplitudeCanvasCtx.fillRect(0, 0, amplitudeCanvas.width, amplitudeCanvas.height);

    amplitudeCanvasCtx.lineWidth = 2;
    amplitudeCanvasCtx.strokeStyle = 'rgb(0, 255, 0)';
    amplitudeCanvasCtx.beginPath();

    const sliceWidth = amplitudeCanvas.width * 1.0 / GRAPH_WINDOW_LENGTH;
    let x = 0;
    for(let i = 0; i < GRAPH_WINDOW_LENGTH; i++) {
      const v = graphWindowData[(i + graphWindowStart) % GRAPH_WINDOW_LENGTH] / 128.0;
      const y = v * amplitudeCanvas.height/2;

      if(i === 0) {
        amplitudeCanvasCtx.moveTo(x, y);
      } else {
        amplitudeCanvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    amplitudeCanvasCtx.lineTo(amplitudeCanvas.width, amplitudeCanvas.height/2);
    amplitudeCanvasCtx.stroke();
  }
}

function gotStream(stream) {
  window.stream = stream; // make stream available to console
  
  visualize(stream);
}

function handleError(error) {
  console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
}

function start() {
  // Second call to getUserMedia() with changed device may cause error, so we need to release stream before changing device
  if (window.stream) {
    stream.getAudioTracks()[0].stop();
  }

  const audioSource = audioInputSelect.value;
  
  const constraints = {
    audio: {deviceId: audioSource ? {exact: audioSource} : undefined}
  };
  
  navigator.mediaDevices.getUserMedia(constraints).then(gotStream).catch(handleError);
}

function createDownloadLink(blob,encoding,raw_or_filtered) {
  var url = URL.createObjectURL(blob);
  var au = document.createElement('audio');
  var li = document.createElement('li');
  var link = document.createElement('a');
  au.controls = true;
  au.src = url;
  link.href = url;
  link.download = new Date().toISOString() + '_' + raw_or_filtered + '.'+encoding;
  link.innerHTML = link.download;
  li.appendChild(au);
  li.appendChild(link);
  recordingsList.appendChild(li);
}



audioInputSelect.onchange = start;
  
startRecord.onclick = e => {
  startRecord.disabled = true;
  stopRecord.disabled=false;
  audioChunks = [];
  rec_raw.startRecording();
  rec_filtered.startRecording();
}
stopRecord.onclick = e => {
  startRecord.disabled = false;
  stopRecord.disabled=true;
  rec_raw.finishRecording();
  rec_filtered.finishRecording();
}

navigator.mediaDevices.enumerateDevices()
.then(gotDevices)
.then(start)
.catch(handleError);

//BPM starts here

// audio_file.onchange = function() {
//   var file = this.files[0];
//   var reader = new FileReader();
//   var context = new(window.AudioContext || window.webkitAudioContext)();
//   reader.onload = function() {
//     context.decodeAudioData(reader.result, function(buffer) {
//       prepare(buffer);
//     });
//   };
//   reader.readAsArrayBuffer(file);
// };

function prepare(blob) {
  const audioContext = new AudioContext();
  const fileReader = new FileReader();
  fileReader.onloadend = () => {
    let myArrayBuffer = fileReader.result;
    audioContext.decodeAudioData(myArrayBuffer, (audioBuffer) => {
      // Do something with audioBuffer
      filterprep(audioBuffer);
    });
  };
  //Load blob
  fileReader.readAsArrayBuffer(buffer);
}

function filterprep(buffer){
  var offlineContext = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  var source = offlineContext.createBufferSource();
  source.buffer = buffer;
  var filter = offlineContext.createBiquadFilter();
  filter.type = "lowpass";
  source.connect(filter);
  filter.connect(offlineContext.destination);
  source.start(0);
  offlineContext.startRendering();
  offlineContext.oncomplete = function(e) {
    process(e);
  };
}

function process(e) {
  var filteredBuffer = e.renderedBuffer;
  //If you want to analyze both channels, use the other channel later
  var data = filteredBuffer.getChannelData(0);
  var max = arrayMax(data); 
  var min = arrayMin(data);
  //var threshold = min + (max - min) * 0.98;
  //console.log("max ::: ", max);
  var threshold = 0.1*(max);
  var peaks = getPeaksAtThreshold(data, threshold);
  //console.log("peaks ::: ", peaks);
  //console.log("threshold ::: ", threshold);
  var intervalCounts = countIntervalsBetweenNearbyPeaks(peaks);
  var tempoCounts = groupNeighborsByTempo(intervalCounts);
  tempoCounts.sort(function(a, b) {
    return b.count - a.count;
  });
  if (tempoCounts.length) {
    output.innerHTML = tempoCounts[0].tempo/2;
  }
}

// http://tech.beatport.com/2014/web-audio/beat-detection-using-web-audio/
function getPeaksAtThreshold(data, threshold) {
  var peaksArray = [];
  var length = data.length;
  for (var i = 0; i < length;) {
    if (data[i] > threshold) {
      peaksArray.push(i);
      // Skip forward ~ 1/4s to get past this peak.
      i += 10000;
    }
    i++;
  }
  return peaksArray;
}

function countIntervalsBetweenNearbyPeaks(peaks) {
  var intervalCounts = [];
  peaks.forEach(function(peak, index) {
    for (var i = 0; i < 10; i++) {
      var interval = peaks[index + i] - peak;
      var foundInterval = intervalCounts.some(function(intervalCount) {
        if (intervalCount.interval === interval) return intervalCount.count++;
      });
      //Additional checks to avoid infinite loops in later processing
      if (!isNaN(interval) && interval !== 0 && !foundInterval) {
        intervalCounts.push({
          interval: interval,
          count: 1
        });
      }
    }
  });
  return intervalCounts;
}

function groupNeighborsByTempo(intervalCounts) {
  var tempoCounts = [];
  intervalCounts.forEach(function(intervalCount) {
    //Convert an interval to tempo
    var theoreticalTempo = 60 / (intervalCount.interval / 44100);
    theoreticalTempo = Math.round(theoreticalTempo);
    if (theoreticalTempo === 0) {
      return;
    }
    // Adjust the tempo to fit within the 90-180 BPM range
    while (theoreticalTempo < 90) theoreticalTempo *= 2;
    while (theoreticalTempo > 180) theoreticalTempo /= 2;

    var foundTempo = tempoCounts.some(function(tempoCount) {
      if (tempoCount.tempo === theoreticalTempo) return tempoCount.count += intervalCount.count;
    });
    if (!foundTempo) {
      tempoCounts.push({
        tempo: theoreticalTempo,
        count: intervalCount.count
      });
    }
  });
  return tempoCounts;
}

// http://stackoverflow.com/questions/1669190/javascript-min-max-array-values
function arrayMin(arr) {
  var len = arr.length,
    min = Infinity;
  while (len--) {
    if (arr[len] < min) {
      min = arr[len];
    }
  }
  return min;
}

function arrayMax(arr) {
  var len = arr.length,
    max = -Infinity;
  while (len--) {
    if (arr[len] > max) {
      max = arr[len];
    }
  }
  return max;
}