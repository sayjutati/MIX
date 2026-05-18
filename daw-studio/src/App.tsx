import { useState, useRef, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import "./App.css";

const TRACK_COLORS = ['#e74c3c', '#9b59b6', '#3498db', '#1abc9c', '#f1c40f', '#e67e22'];

interface Track {
  id: number;
  url: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  speed: number;
  bass: number;
  treble: number;
  noiseReduce: number;
  compressor: number;
  chorus: number;
  delay: number;
  reverb: number;
  fadeIn: number;
  fadeOut: number;
  duration: number;
  showFx: boolean;
  isSolo: boolean;
  isMuted: boolean; // ✅ ここを追加！設計図にミュート状態を登録
  offset: number; 
  tremolo: number; 
}

const createBetterReverbIR = (ctx: AudioContext) => {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * 2.0; 
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let i = 0; i < length; i++) {
    const decay = Math.pow(1 - i / length, 3);
    impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * decay;
    impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * decay;
  }
  return impulse;
};

const audioBufferToWav = (buffer: AudioBuffer) => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; 
  const bitDepth = 16;
  const result = new Float32Array(buffer.length * numChannels);
  
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < buffer.length; i++) {
      result[i * 2] = left[i];
      result[i * 2 + 1] = right[i];
    }
  } else {
    result.set(buffer.getChannelData(0));
  }

  const dataLength = result.length * (bitDepth / 8);
  const bufferArr = new ArrayBuffer(44 + dataLength);
  const view = new DataView(bufferArr);
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([view], { type: 'audio/wav' });
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds % 1) * 10).toString();
  return `${m}:${s}.${ms}`;
};

const ControlKnob = ({ label, color, min, max, step, value, onChange }: { label: string, color: string, min: string, max: string, step: string, value: number, onChange: (val: number) => void }) => (
  <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
    <span style={{ color: color, fontSize: "11px", whiteSpace: "nowrap", marginBottom: "2px" }}>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", cursor: "pointer" }} />
  </div>
);

function TrackItem({ track, hasSolo, masterVolume, globalTime, isPlayingGlobal, onDelete, onDuplicate, onUpdate, onContextMenu }: { 
  track: Track; 
  hasSolo: boolean;
  masterVolume: number;
  globalTime: number;
  isPlayingGlobal: boolean;
  onDelete: (id: number) => void; 
  onDuplicate: (track: Track) => void;
  onUpdate: (id: number, field: keyof Track, value: any) => void;
  onContextMenu: (e: React.MouseEvent, trackId: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const isLocalPlayingRef = useRef(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);
  const compRef = useRef<DynamicsCompressorNode | null>(null);
  const eqBassRef = useRef<BiquadFilterNode | null>(null);
  const eqTrebleRef = useRef<BiquadFilterNode | null>(null);
  const noiseFilterRef = useRef<BiquadFilterNode | null>(null);
  const tremoloGainRef = useRef<GainNode | null>(null);
  const chorusGainRef = useRef<GainNode | null>(null);
  const delayGainRef = useRef<GainNode | null>(null);
  const reverbGainRef = useRef<GainNode | null>(null);
  const fadeGainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (wavesurferRef.current) wavesurferRef.current.destroy();

    wavesurferRef.current = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(255, 255, 255, 0.4)',
      progressColor: 'rgba(255, 255, 255, 0.9)',
      height: 80, 
      url: track.url,
      interact: false, 
      minPxPerSec: 50, 
      fillParent: false,
      hideScrollbar: true,
    });

    wavesurferRef.current.on('ready', () => {
      const mediaElt = wavesurferRef.current?.getMediaElement();
      const dur = wavesurferRef.current?.getDuration() || 0;
      if (dur !== track.duration) onUpdate(track.id, 'duration', dur);

      if (mediaElt && !(mediaElt as any)._audioCtxConnected) {
        (mediaElt as any)._audioCtxConnected = true;
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;

        const source = ctx.createMediaElementSource(mediaElt);

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = track.noiseReduce * 300; 
        noiseFilterRef.current = noiseFilter;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = track.compressor * -50; 
        comp.ratio.value = 1 + track.compressor * 19; 
        compRef.current = comp;

        const eqBass = ctx.createBiquadFilter();
        eqBass.type = 'lowshelf';
        eqBass.frequency.value = 250;
        eqBass.gain.value = track.bass;
        eqBassRef.current = eqBass;

        const eqTreble = ctx.createBiquadFilter();
        eqTreble.type = 'highshelf';
        eqTreble.frequency.value = 4000;
        eqTreble.gain.value = track.treble;
        eqTrebleRef.current = eqTreble;

        const tremoloOsc = ctx.createOscillator();
        const tremoloDepth = ctx.createGain();
        const tremoloNode = ctx.createGain();
        tremoloOsc.frequency.value = 5; 
        tremoloDepth.gain.value = track.tremolo; 
        tremoloOsc.connect(tremoloDepth);
        tremoloDepth.connect(tremoloNode.gain);
        tremoloOsc.start();
        tremoloGainRef.current = tremoloDepth;

        const panner = ctx.createStereoPanner();
        panner.pan.value = track.pan;
        pannerRef.current = panner;

        const chorusDelay = ctx.createDelay();
        chorusDelay.delayTime.value = 0.03;
        const chorusGain = ctx.createGain();
        chorusGain.gain.value = track.chorus;
        chorusGainRef.current = chorusGain;

        const delay = ctx.createDelay();
        delay.delayTime.value = 0.35;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.3;
        const delayGain = ctx.createGain();
        delayGain.gain.value = track.delay;
        delayGainRef.current = delayGain;

        const convolver = ctx.createConvolver();
        convolver.buffer = createBetterReverbIR(ctx);
        const reverbGain = ctx.createGain();
        reverbGain.gain.value = track.reverb;
        reverbGainRef.current = reverbGain;

        const fadeGain = ctx.createGain();
        fadeGain.gain.value = 1;
        fadeGainRef.current = fadeGain;

        source.connect(noiseFilter);
        noiseFilter.connect(comp); 
        comp.connect(eqBass);
        eqBass.connect(eqTreble);
        eqTreble.connect(tremoloNode); 
        tremoloNode.connect(panner);

        panner.connect(fadeGain);

        panner.connect(chorusDelay);
        chorusDelay.connect(chorusGain);
        chorusGain.connect(fadeGain);

        panner.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(delayGain);
        delayGain.connect(fadeGain);

        panner.connect(convolver);
        convolver.connect(reverbGain);
        reverbGain.connect(fadeGain);

        fadeGain.connect(ctx.destination);
      }
    });

    return () => {
      wavesurferRef.current?.destroy();
      audioCtxRef.current?.close();
    };
  }, [track.url]); 

  useEffect(() => wavesurferRef.current?.setVolume(track.volume * masterVolume), [track.volume, masterVolume]);
  useEffect(() => { if (pannerRef.current) pannerRef.current.pan.value = track.pan; }, [track.pan]);
  useEffect(() => { 
    if (compRef.current) { 
      compRef.current.threshold.value = track.compressor * -50; 
      compRef.current.ratio.value = 1 + track.compressor * 19; 
    } 
  }, [track.compressor]);
  useEffect(() => { if (eqBassRef.current) eqBassRef.current.gain.value = track.bass; }, [track.bass]);
  useEffect(() => { if (eqTrebleRef.current) eqTrebleRef.current.gain.value = track.treble; }, [track.treble]);
  useEffect(() => { if (noiseFilterRef.current) noiseFilterRef.current.frequency.value = track.noiseReduce * 300; }, [track.noiseReduce]);
  useEffect(() => { if (tremoloGainRef.current) tremoloGainRef.current.gain.value = track.tremolo; }, [track.tremolo]);
  useEffect(() => { if (chorusGainRef.current) chorusGainRef.current.gain.value = track.chorus; }, [track.chorus]);
  useEffect(() => { if (delayGainRef.current) delayGainRef.current.gain.value = track.delay; }, [track.delay]);
  useEffect(() => { if (reverbGainRef.current) reverbGainRef.current.gain.value = track.reverb; }, [track.reverb]);
  useEffect(() => { if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(track.speed); }, [track.speed]);
  
  // ✅ ローカルのstateを廃止して、親(track.isMuted)から状態を受け取るように修正
  const effectiveMute = track.isMuted || (hasSolo && !track.isSolo);
  useEffect(() => { wavesurferRef.current?.setMuted(effectiveMute); }, [effectiveMute]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    
    if (isPlayingGlobal) {
      const localTime = globalTime - track.offset;
      if (localTime >= 0 && localTime < track.duration) {
        if (!isLocalPlayingRef.current) {
          ws.setTime(localTime);
          ws.play();
          isLocalPlayingRef.current = true;
        }
      } else {
        if (isLocalPlayingRef.current) {
          ws.pause();
          isLocalPlayingRef.current = false;
        }
      }
    } else {
      if (isLocalPlayingRef.current) {
        ws.pause();
        isLocalPlayingRef.current = false;
      }
    }
  }, [globalTime, isPlayingGlobal, track.offset, track.duration]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startOffset = track.offset;

    const handleDragMove = (moveEvent: MouseEvent) => {
      const diffX = moveEvent.clientX - startX;
      const newOffset = Math.max(0, startOffset + diffX / 50); 
      onUpdate(track.id, 'offset', newOffset);
    };

    const handleDragEnd = () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  return (
    <div style={{ display: "flex", borderBottom: "1px solid #222", background: "#1a1a1a" }}>
      
      <div style={{ width: "220px", flexShrink: 0, position: "sticky", left: 0, zIndex: 10, background: "#252525", borderRight: "1px solid #111", display: "flex", flexDirection: "column", opacity: effectiveMute ? 0.6 : 1, transition: "opacity 0.2s" }}>
        
        <div style={{ padding: "12px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input type="color" value={track.color} onChange={(e) => onUpdate(track.id, 'color', e.target.value)} className="tooltip" data-tooltip="色を変更" style={{ width: "16px", height: "16px", padding: 0, border: "none", cursor: "pointer", background: "transparent" }} />
              <input type="text" value={track.name} onChange={(e) => onUpdate(track.id, 'name', e.target.value)} style={{ background: "transparent", color: "#ddd", fontSize: "14px", fontWeight: "bold", border: "none", width: "95px", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={() => onDuplicate(track)} className="tooltip" data-tooltip="複製" style={{ background: "#444", color: "white", border: "none", padding: "2px 6px", borderRadius: "3px", fontSize: "10px", cursor: "pointer" }}>📄</button>
              <button onClick={() => onDelete(track.id)} className="tooltip" data-tooltip="削除" style={{ background: "transparent", color: "#e74c3c", border: "none", fontSize: "14px", cursor: "pointer", fontWeight: "bold" }}>×</button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <button onClick={() => onUpdate(track.id, 'isSolo', !track.isSolo)} className="tooltip" data-tooltip={track.isSolo ? "ソロ解除" : "ソロ"} style={{ background: track.isSolo ? "#f1c40f" : "#333", color: track.isSolo ? "black" : "white", border: "1px solid #444", width: "30px", height: "30px", borderRadius: "4px", fontSize: "12px", cursor: "pointer", fontWeight: "bold" }}>S</button>
            {/* ✅ ミュートボタンも onUpdate を使って親のデータを書き換える！ */}
            <button onClick={() => onUpdate(track.id, 'isMuted', !track.isMuted)} className="tooltip" data-tooltip={track.isMuted ? "ミュート解除" : "ミュート"} style={{ background: track.isMuted ? "#e74c3c" : "#333", color: "white", border: "1px solid #444", width: "30px", height: "30px", borderRadius: "4px", fontSize: "12px", cursor: "pointer", fontWeight: "bold" }}>M</button>
            <div style={{ flex: 1 }}><ControlKnob label={`🔈 Vol: ${Math.round(track.volume * 100)}`} color="#ccc" min="0" max="1" step="0.01" value={track.volume} onChange={(v) => onUpdate(track.id, 'volume', v)} /></div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <button onClick={() => onUpdate(track.id, 'showFx', !track.showFx)} className="tooltip" data-tooltip="エフェクト開閉" style={{ background: track.showFx ? "#4facfe" : "#333", color: "white", border: "none", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: "bold", width: "45px" }}>FX</button>
            <div style={{ flex: 1 }} className="tooltip" data-tooltip="左右バランス"><ControlKnob label={`L ◀ Pan ▶ R`} color="#3498db" min="-1" max="1" step="0.01" value={track.pan} onChange={(v) => onUpdate(track.id, 'pan', v)} /></div>
          </div>
        </div>

        {track.showFx && (
          <div style={{ background: "#1e1e1e", padding: "10px", borderTop: "1px solid #333", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", borderBottom: "1px solid #111" }}>
            <div className="tooltip" data-tooltip="再生速度"><ControlKnob label={`⏩ 速度: ${track.speed}x`} color="#e67e22" min="0.03" max="5" step="0.01" value={track.speed} onChange={(v) => onUpdate(track.id, 'speed', v)} /></div>
            <div className="tooltip" data-tooltip="音圧アップ"><ControlKnob label={`🗜️ ｺﾝﾌﾟ: ${Math.round(track.compressor * 100)}`} color="#e74c3c" min="0" max="1" step="0.01" value={track.compressor} onChange={(v) => onUpdate(track.id, 'compressor', v)} /></div>
            <div className="tooltip" data-tooltip="低音(Bass)"><ControlKnob label={`🎚️ 低音: ${track.bass}dB`} color="#3498db" min="-15" max="15" step="1" value={track.bass} onChange={(v) => onUpdate(track.id, 'bass', v)} /></div>
            <div className="tooltip" data-tooltip="高音(Treble)"><ControlKnob label={`🎚️ 高音: ${track.treble}dB`} color="#3498db" min="-15" max="15" step="1" value={track.treble} onChange={(v) => onUpdate(track.id, 'treble', v)} /></div>
            <div className="tooltip" data-tooltip="自動で音量を揺らす"><ControlKnob label={`🌊 ﾄﾚﾓﾛ: ${Math.round(track.tremolo * 100)}`} color="#9b59b6" min="0" max="1" step="0.01" value={track.tremolo} onChange={(v) => onUpdate(track.id, 'tremolo', v)} /></div>
            <div className="tooltip" data-tooltip="コーラス"><ControlKnob label={`👥 ｺｰﾗｽ`} color="#1abc9c" min="0" max="1" step="0.01" value={track.chorus} onChange={(v) => onUpdate(track.id, 'chorus', v)} /></div>
            <div className="tooltip" data-tooltip="ディレイ"><ControlKnob label={`🔂 ﾃﾞｨﾚｲ`} color="#ccc" min="0" max="1" step="0.01" value={track.delay} onChange={(v) => onUpdate(track.id, 'delay', v)} /></div>
            <div className="tooltip" data-tooltip="リバーブ"><ControlKnob label={`🌌 ﾘﾊﾞｰﾌﾞ`} color="#ccc" min="0" max="1" step="0.01" value={track.reverb} onChange={(v) => onUpdate(track.id, 'reverb', v)} /></div>
          </div>
        )}
      </div>

      <div 
        onContextMenu={(e) => onContextMenu(e, track.id)}
        style={{ flex: 1, position: "relative", padding: "10px", minWidth: 0, display: "flex", alignItems: "flex-start", cursor: "context-menu" }}
      >
        <div 
          onMouseDown={handleDragStart}
          className="tooltip" data-tooltip="ドラッグして位置を移動"
          style={{ 
            position: "relative",
            left: `${track.offset * 50}px`,
            width: `${track.duration * 50}px`, 
            height: "80px", 
            background: track.color, 
            borderRadius: "6px", 
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            opacity: effectiveMute ? 0.3 : 1, 
            transition: "opacity 0.2s",
            cursor: "grab"
          }}>
          <div ref={containerRef} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
        </div>
      </div>

    </div>
  );
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const [globalTime, setGlobalTime] = useState(0);
  const [isPlayingGlobal, setIsPlayingGlobal] = useState(false);
  const [isEditingGlobalTime, setIsEditingGlobalTime] = useState(false); 
  const [masterVolume, setMasterVolume] = useState(1.0); 

  const [bpm, setBpm] = useState(120);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const audioCtxRef = useRef<AudioContext>(new AudioContext());
  const nextClickRef = useRef(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const maxDuration = Math.max(15, ...tracks.map(t => t.offset + t.duration || 0));
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, trackId: number} | null>(null);

  const hasSolo = tracks.some(t => t.isSolo);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording || isPlayingGlobal) {
      const startTime = Date.now() - globalTime * 1000;
      interval = setInterval(() => {
        const currentTime = (Date.now() - startTime) / 1000;
        setGlobalTime(currentTime);

        if (metronomeOn) {
          const ctx = audioCtxRef.current;
          if (ctx.state === 'suspended') ctx.resume();
          const beatLen = 60 / bpm;
          while (nextClickRef.current < currentTime + 0.1) {
            if (nextClickRef.current >= currentTime) {
              const osc = ctx.createOscillator();
              osc.frequency.value = 1000; 
              osc.connect(ctx.destination);
              osc.start(ctx.currentTime + (nextClickRef.current - currentTime));
              osc.stop(ctx.currentTime + (nextClickRef.current - currentTime) + 0.05);
            }
            nextClickRef.current += beatLen;
          }
        }

        if (scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          const playheadX = currentTime * 50; 
          if (playheadX > container.scrollLeft + container.clientWidth - 220 - 150) {
            container.scrollLeft = playheadX - container.clientWidth + 220 + 150;
          }
        }
      }, 30);
    }
    return () => clearInterval(interval!);
  }, [isRecording, isPlayingGlobal, globalTime, metronomeOn, bpm]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const saveProject = async () => {
    if (tracks.length === 0) return alert("保存するトラックがありません！");
    try {
      const projectData = await Promise.all(tracks.map(async (track) => {
        const res = await fetch(track.url);
        const blob = await res.blob();
        const reader = new FileReader();
        const base64 = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        return { ...track, audioData: base64 };
      }));

      const json = JSON.stringify({ tracks: projectData, bpm, masterVolume });
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "my_project.daw"; 
      a.click();
    } catch (e) {
      alert("保存に失敗しました…。");
    }
  };

  const loadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedData = JSON.parse(text);
      
      setBpm(parsedData.bpm || 120);
      setMasterVolume(parsedData.masterVolume || 1.0);

      const restoredTracks = await Promise.all(parsedData.tracks.map(async (trackData: any) => {
        const res = await fetch(trackData.audioData);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const { audioData, ...rest } = trackData;
        return { 
          ...rest, 
          url,
          isMuted: rest.isMuted || false // 💡 古いセーブデータ対策
        } as Track;
      }));

      setTracks(restoredTracks);
      seekToTime(0);
    } catch (err) {
      alert("ファイルの読み込みに失敗しました！");
    }
    e.target.value = "";
  };

  const exportMixdown = async () => {
    if (tracks.length === 0) return alert("書き出すトラックがありません！");
    const isConfirmed = window.confirm("全トラックを統合してWAVファイルとして書き出しますか？（少し時間がかかります）");
    if (!isConfirmed) return;

    try {
      const totalDur = Math.max(1, ...tracks.map(t => t.offset + t.duration));
      const offlineCtx = new OfflineAudioContext(2, 44100 * totalDur, 44100);

      for (const track of tracks) {
        // ✅ track.isMuted がここでエラーにならなくなった！
        if (track.isMuted || (hasSolo && !track.isSolo)) continue;
        const res = await fetch(track.url);
        const buf = await offlineCtx.decodeAudioData(await res.arrayBuffer());
        
        const src = offlineCtx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = track.speed;

        const panner = offlineCtx.createStereoPanner();
        panner.pan.value = track.pan;

        const gain = offlineCtx.createGain();
        gain.gain.value = track.volume * masterVolume;

        src.connect(panner);
        panner.connect(gain);
        gain.connect(offlineCtx.destination);

        src.start(track.offset);
      }

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWav(renderedBuffer);
      
      const a = document.createElement("a");
      a.href = URL.createObjectURL(wavBlob);
      a.download = "My_Mixdown.wav"; 
      a.click();
      alert("書き出しが完了しました！");
    } catch (e) {
      console.error(e);
      alert("エクスポートに失敗しました。");
    }
  };

  const handleImportAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const randomColor = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
    const defaultName = file.name.replace(/\.[^/.]+$/, "");

    setTracks(prev => [...prev, { 
      id: Date.now(), url, name: defaultName, color: randomColor,
      volume: 0.8, pan: 0, speed: 1.0, bass: 0, treble: 0, 
      noiseReduce: 0, compressor: 0, chorus: 0, delay: 0, reverb: 0, fadeIn: 0, fadeOut: 0, duration: 0, showFx: false, isSolo: false, isMuted: false, offset: 0, tremolo: 0
    }]);
    e.target.value = ""; 
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

      mediaRecorder.onstop = () => {
        const url = URL.createObjectURL(new Blob(audioChunksRef.current, { type: "audio/wav" }));
        const randomColor = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
        setTracks(prev => [...prev, { 
          id: Date.now(), url, name: `トラック ${prev.length + 1}`, color: randomColor,
          volume: 0.8, pan: 0, speed: 1.0, bass: 0, treble: 0, 
          noiseReduce: 0, compressor: 0, chorus: 0, delay: 0, reverb: 0, fadeIn: 0, fadeOut: 0, duration: 0, showFx: false, isSolo: false, isMuted: false, offset: globalTime, tremolo: 0 // 💡 録音開始時間をoffsetに！
        }]);
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      nextClickRef.current = Math.ceil(globalTime / (60 / bpm)) * (60 / bpm);
    } catch (error) {
      alert("マイクが許可されていません！");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const seekToTime = (time: number) => {
    setGlobalTime(time);
    nextClickRef.current = Math.ceil(time / (60 / bpm)) * (60 / bpm);
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const playheadX = time * 50;
      if (playheadX < container.scrollLeft || playheadX > container.scrollLeft + container.clientWidth - 220) {
        container.scrollLeft = Math.max(0, playheadX - 100);
      }
    }
  };

  const playAll = () => {
    setIsPlayingGlobal(true);
    nextClickRef.current = Math.ceil(globalTime / (60 / bpm)) * (60 / bpm);
  };
  
  const stopAll = () => {
    setIsPlayingGlobal(false);
  };

  const handleGlobalTimeBlur = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
    setIsEditingGlobalTime(false);
    const newTime = parseFloat(e.currentTarget.value);
    if (!isNaN(newTime)) seekToTime(Math.max(0, newTime)); 
  };

  const deleteTrack = (id: number) => setTracks(tracks.filter(t => t.id !== id));
  const duplicateTrack = (track: Track) => setTracks(prev => [...prev, { ...track, id: Date.now(), name: `${track.name} (コピー)` }]);
  const updateTrack = (id: number, field: keyof Track, value: any) => setTracks(tracks.map(t => t.id === id ? { ...t, [field]: value } : t));

  const handleContextMenu = (e: React.MouseEvent, trackId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, trackId });
  };

  const loopTrackAudio = async (trackId: number, times: number) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const isConfirmed = window.confirm(`このトラックを ${times} 倍の長さにループ複製しますか？`);
    if (!isConfirmed) return;

    try {
      const ctx = new window.AudioContext();
      const res = await fetch(track.url);
      
      const audioBuffer = await ctx.decodeAudioData(await res.arrayBuffer());

      const newBuffer = ctx.createBuffer(
        audioBuffer.numberOfChannels,
        audioBuffer.length * times,
        audioBuffer.sampleRate
      );

      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        const channelData = audioBuffer.getChannelData(c);
        const newChannelData = newBuffer.getChannelData(c);
        for (let i = 0; i < times; i++) {
          newChannelData.set(channelData, i * audioBuffer.length);
        }
      }

      const wavBlob = audioBufferToWav(newBuffer);
      updateTrack(track.id, 'url', URL.createObjectURL(wavBlob));
      updateTrack(track.id, 'duration', audioBuffer.duration * times);
      
    } catch (err) {
      console.error(err);
      alert("ループ処理に失敗しました！");
    }
  };

  const timelineTicks = [];
  for (let i = 0; i <= maxDuration + 20; i++) timelineTicks.push(i);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#111", color: "white", fontFamily: "sans-serif" }}>
      
      {/* 🔴 上部ツールバー */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#333", padding: "10px 20px", borderBottom: "1px solid #444" }}>
        
        <div style={{ display: "flex", gap: "10px" }}>
          <input type="file" id="load-project" accept=".daw" style={{ display: 'none' }} onChange={loadProject} />
          <button onClick={saveProject} className="tooltip" data-tooltip="プロジェクトを保存" style={{ background: "#3498db", color: "white", padding: "10px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>💾 保存</button>
          <button onClick={() => document.getElementById('load-project')?.click()} className="tooltip" data-tooltip="プロジェクトを読込" style={{ background: "#9b59b6", color: "white", padding: "10px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>📂 読込</button>
          <div style={{ borderLeft: "1px solid #555", margin: "0 5px" }}></div>
          <button onClick={exportMixdown} className="tooltip" data-tooltip="完成した曲をWAV出力" style={{ background: "#f1c40f", color: "black", padding: "10px 15px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>💿 曲を書き出し</button>
          <div style={{ borderLeft: "1px solid #555", margin: "0 5px" }}></div>
          <button onClick={playAll} style={{ background: "#2ecc71", color: "white", padding: "10px 20px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>▶️ 再生</button>
          <button onClick={stopAll} style={{ background: "#f39c12", color: "white", padding: "10px 20px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>⏹ 停止</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "#222", padding: "5px 10px", borderRadius: "4px", border: "1px solid #444" }}>
            <span style={{ fontSize: "11px", color: "#aaa" }}>BPM:</span>
            <input type="number" value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ width: "45px", background: "transparent", color: "white", border: "none", outline: "none", fontSize: "14px", fontWeight: "bold" }} />
            <button onClick={() => setMetronomeOn(!metronomeOn)} style={{ background: metronomeOn ? "#e74c3c" : "#555", color: "white", border: "none", padding: "4px 8px", borderRadius: "3px", cursor: "pointer", fontSize: "11px", fontWeight: "bold" }}>
              🔔 {metronomeOn ? "ON" : "OFF"}
            </button>
          </div>
          <button onClick={() => seekToTime(0)} className="tooltip" data-tooltip="最初(0秒)に戻す" style={{ background: "#555", color: "white", border: "none", padding: "10px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>⏮️ 0秒へ</button>
          
          <div className="tooltip" data-tooltip="クリックで開始位置（秒）を指定" style={{ background: "#000", borderRadius: "4px", border: "2px solid #555", width: "160px", height: "45px", display: "flex", alignItems: "center", justifyContent: "center", cursor: (isRecording || isPlayingGlobal) ? "default" : "text" }} onClick={() => { if (!isRecording && !isPlayingGlobal) setIsEditingGlobalTime(true); }}>
            {isEditingGlobalTime ? (
              <input type="number" step="0.1" defaultValue={globalTime.toFixed(1)} onBlur={handleGlobalTimeBlur} onKeyDown={(e) => { if (e.key === 'Enter') handleGlobalTimeBlur(e); }} autoFocus style={{ color: "#2ecc71", fontFamily: "monospace", fontSize: "28px", letterSpacing: "2px", textShadow: "0 0 5px rgba(46, 204, 113, 0.5)", background: "transparent", border: "none", textAlign: "center", width: "100%", height: "100%", outline: "none", padding: 0, margin: 0 }} />
            ) : (
              <span style={{ color: isRecording ? "#e74c3c" : "#2ecc71", fontFamily: "monospace", fontSize: "28px", letterSpacing: "2px", textShadow: "0 0 5px rgba(46, 204, 113, 0.5)" }}>{formatTime(globalTime)}</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div className="tooltip" data-tooltip="曲全体の音量" style={{ display: "flex", alignItems: "center", gap: "8px", background: "#222", padding: "5px 10px", borderRadius: "4px", border: "1px solid #444", marginRight: "10px" }}>
            <span style={{ fontSize: "12px", color: "#aaa" }}>マスターVol:</span>
            <input type="range" min="0" max="1" step="0.01" value={masterVolume} onChange={(e) => setMasterVolume(parseFloat(e.target.value))} style={{ width: "60px", cursor: "pointer" }} />
          </div>
          <input type="file" id="import-audio" accept="audio/*" style={{ display: 'none' }} onChange={handleImportAudio} />
          <button onClick={() => document.getElementById('import-audio')?.click()} className="tooltip" data-tooltip="PCから音源を読込" style={{ background: "#8e44ad", color: "white", padding: "10px 15px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>🎵 音源追加</button>
          {!isRecording ? (
            <button onClick={startRecording} style={{ background: "#e74c3c", color: "white", padding: "10px 20px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>🔴 録音</button>
          ) : (
            <button onClick={stopRecording} style={{ background: "#7f8c8d", color: "white", padding: "10px 20px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", animation: "pulse 1s infinite" }}>⏹ 録音停止</button>
          )}
        </div>
      </div>

      {/* 📦 メインワークスペース */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflowX: "auto", overflowY: "auto", position: "relative" }}>
        <div style={{ minWidth: `calc(220px + ${Math.max(15, maxDuration) * 50}px)`, position: "relative", paddingBottom: "50px" }}>
          
          <div style={{ display: "flex", background: "#222", borderBottom: "1px solid #444", position: "sticky", top: 0, zIndex: 20 }}>
            <div style={{ width: "220px", flexShrink: 0, position: "sticky", left: 0, zIndex: 30, background: "#252525", borderRight: "1px solid #111", display: "flex", alignItems: "center", padding: "0 15px", color: "#888", fontSize: "12px", fontWeight: "bold" }}>
              タイムライン
            </div>
            <div style={{ flex: 1, position: "relative", height: "30px" }}>
              {timelineTicks.map(t => (
                <div key={t} style={{ position: "absolute", left: `${t * 50}px`, top: t % 5 === 0 ? "0" : "15px", height: t % 5 === 0 ? "30px" : "15px", color: "#aaa", fontSize: "10px", borderLeft: t % 5 === 0 ? "1px solid #888" : "1px solid #444", paddingLeft: "4px" }}>
                  {t % 5 === 0 && `${t}s`}
                </div>
              ))}
            </div>
          </div>

          {tracks.map(track => (
            <TrackItem key={track.id} track={track} hasSolo={hasSolo} masterVolume={masterVolume} globalTime={globalTime} isPlayingGlobal={isPlayingGlobal} onDelete={deleteTrack} onDuplicate={duplicateTrack} onUpdate={updateTrack} onContextMenu={handleContextMenu} />
          ))}

          {/* 🟢 再生バー */}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(220px + ${globalTime * 50}px)`, width: "2px", background: "#2ecc71", zIndex: 50, pointerEvents: "none", boxShadow: "0 0 5px rgba(46, 204, 113, 0.8)", display: globalTime > 0 ? "block" : "none" }}>
            <div style={{ position: "absolute", top: 0, left: "-5px", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "10px solid #2ecc71" }} />
          </div>

        </div>
      </div>

      {/* ✂️ 右クリックコンテキストメニュー */}
      {contextMenu && (
        <div style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, background: "#333", border: "1px solid #555", borderRadius: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 99999, padding: "5px 0", minWidth: "150px" }}>
          <div style={{ padding: "8px 15px", color: "#aaa", fontSize: "11px", borderBottom: "1px solid #444", marginBottom: "5px" }}>音声の編集</div>
          <button onClick={() => loopTrackAudio(contextMenu.trackId, 2)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", color: "white", border: "none", padding: "8px 15px", cursor: "pointer", fontSize: "13px" }} onMouseOver={e => e.currentTarget.style.background = "#444"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
            🔁 この音を 2倍 にループ
          </button>
          <button onClick={() => loopTrackAudio(contextMenu.trackId, 4)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", color: "white", border: "none", padding: "8px 15px", cursor: "pointer", fontSize: "13px" }} onMouseOver={e => e.currentTarget.style.background = "#444"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
            🔁 この音を 4倍 にループ
          </button>
        </div>
      )}
      
    </div>
  );
}

export default App;