import { useState, useRef, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Square, Mic, SkipBack, Save, FolderOpen, Download, Music, Trash2, Copy, Bell, BellOff, Volume2, Sliders } from "lucide-react";
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
  isSolo: boolean;
  isMuted: boolean;
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
  const writeString = (v: DataView, o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  writeString(view, 0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); writeString(view, 8, 'WAVE'); writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, format, true); view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); view.setUint16(32, numChannels * (bitDepth / 8), true); view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data'); view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, result[i])); view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([view], { type: 'audio/wav' });
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds % 1) * 10).toString();
  return `${m}:${s}.${ms}`;
};

// 通常のツマミ（左パネル用）
const ControlKnob = ({ label, min, max, step, value, onChange, unit = "" }: { label: string, min: string, max: string, step: string, value: number, onChange: (val: number) => void, unit?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", background: "#222", padding: "12px", borderRadius: "8px", border: "1px solid #333" }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#aaa", fontWeight: "bold" }}>
      <span>{label}</span>
      <span style={{ color: "#4facfe" }}>{value}{unit}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", cursor: "pointer", accentColor: "#4facfe" }} />
  </div>
);

// 🌟 新機能：微調整ボタン付きのエフェクト専用ツマミ（下パネル用）
const EffectKnob = ({ label, min, max, step, value, onChange, unit = "", defaultValue = 0 }: { label: string, min: string, max: string, step: string, value: number, onChange: (val: number) => void, unit?: string, defaultValue?: number }) => {
  const handleDec = () => onChange(Math.max(parseFloat(min), Math.round((value - 0.1) * 100) / 100));
  const handleInc = () => onChange(Math.min(parseFloat(max), Math.round((value + 0.1) * 100) / 100));
  const handleReset = () => onChange(defaultValue);
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", background: "#222", padding: "12px", borderRadius: "8px", border: "1px solid #333" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#aaa", fontWeight: "bold" }}>
        <span>{label}</span>
        <span style={{ color: "#4facfe" }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", cursor: "pointer", accentColor: "#4facfe" }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: "5px", marginTop: "4px" }}>
        <button onClick={handleDec} className="tooltip" data-tooltip="-0.1" style={{ flex: 1, background: "#333", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "14px", padding: "2px 0", fontWeight: "bold", display: "flex", justifyContent: "center", alignItems: "center" }}>←</button>
        <button onClick={handleReset} className="tooltip" data-tooltip="リセット" style={{ flex: 1, background: "#333", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", padding: "2px 0", fontWeight: "bold", display: "flex", justifyContent: "center", alignItems: "center" }}>{defaultValue === 1 ? "1" : "0"}</button>
        <button onClick={handleInc} className="tooltip" data-tooltip="+0.1" style={{ flex: 1, background: "#333", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "14px", padding: "2px 0", fontWeight: "bold", display: "flex", justifyContent: "center", alignItems: "center" }}>→</button>
      </div>
    </div>
  );
};

function TrackItem({ track, isSelected, hasSolo, masterVolume, globalTime, isPlayingGlobal, onSelect, onDelete, onDuplicate, onUpdate, onContextMenu }: { 
  track: Track; 
  isSelected: boolean; 
  hasSolo: boolean;
  masterVolume: number;
  globalTime: number;
  isPlayingGlobal: boolean;
  onSelect: (id: number) => void; 
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
    if (compRef.current) { compRef.current.threshold.value = track.compressor * -50; compRef.current.ratio.value = 1 + track.compressor * 19; } 
  }, [track.compressor]);
  useEffect(() => { if (eqBassRef.current) eqBassRef.current.gain.value = track.bass; }, [track.bass]);
  useEffect(() => { if (eqTrebleRef.current) eqTrebleRef.current.gain.value = track.treble; }, [track.treble]);
  useEffect(() => { if (noiseFilterRef.current) noiseFilterRef.current.frequency.value = track.noiseReduce * 300; }, [track.noiseReduce]);
  useEffect(() => { if (tremoloGainRef.current) tremoloGainRef.current.gain.value = track.tremolo; }, [track.tremolo]);
  useEffect(() => { if (chorusGainRef.current) chorusGainRef.current.gain.value = track.chorus; }, [track.chorus]);
  useEffect(() => { if (delayGainRef.current) delayGainRef.current.gain.value = track.delay; }, [track.delay]);
  useEffect(() => { if (reverbGainRef.current) reverbGainRef.current.gain.value = track.reverb; }, [track.reverb]);
  useEffect(() => { if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(track.speed); }, [track.speed]);
  
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
    <div style={{ display: "flex", borderBottom: "1px solid #111", background: isSelected ? "#2a2a2a" : "#1a1a1a", transition: "background 0.2s" }}>
      
      <div 
        onClick={() => onSelect(track.id)} 
        style={{ width: "250px", flexShrink: 0, position: "sticky", left: 0, zIndex: 10, background: isSelected ? "#333" : "#252525", borderRight: "1px solid #111", display: "flex", flexDirection: "column", opacity: effectiveMute ? 0.5 : 1, transition: "all 0.2s", cursor: "pointer", borderLeft: isSelected ? `4px solid ${track.color}` : "4px solid transparent" }}
      >
        <div style={{ padding: "12px 15px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="color" value={track.color} onChange={(e) => onUpdate(track.id, 'color', e.target.value)} className="tooltip" data-tooltip="色を変更" style={{ width: "16px", height: "16px", padding: 0, border: "none", cursor: "pointer", background: "transparent" }} />
              <input type="text" value={track.name} onChange={(e) => onUpdate(track.id, 'name', e.target.value)} style={{ background: "transparent", color: "#ddd", fontSize: "14px", fontWeight: "bold", border: "none", width: "110px", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={(e) => { e.stopPropagation(); onDuplicate(track); }} className="tooltip" data-tooltip="複製" style={{ background: "transparent", color: "#aaa", border: "none", cursor: "pointer", padding: "2px" }}><Copy size={14} /></button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(track.id); }} className="tooltip" data-tooltip="削除" style={{ background: "transparent", color: "#e74c3c", border: "none", cursor: "pointer", padding: "2px" }}><Trash2 size={14} /></button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={(e) => { e.stopPropagation(); onUpdate(track.id, 'isSolo', !track.isSolo); }} className="tooltip" data-tooltip="ソロ" style={{ background: track.isSolo ? "#f1c40f" : "#444", color: track.isSolo ? "black" : "white", border: "none", width: "28px", height: "28px", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}>S</button>
              <button onClick={(e) => { e.stopPropagation(); onUpdate(track.id, 'isMuted', !track.isMuted); }} className="tooltip" data-tooltip="ミュート" style={{ background: track.isMuted ? "#e74c3c" : "#444", color: "white", border: "none", width: "28px", height: "28px", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}>M</button>
            </div>
            
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
              <Volume2 size={16} color="#888" />
              <input type="range" min="0" max="1" step="0.01" value={track.volume} onChange={(e) => onUpdate(track.id, 'volume', parseFloat(e.target.value))} style={{ width: "100%", cursor: "pointer", accentColor: "#aaa" }} />
            </div>
          </div>
        </div>
      </div>

      <div 
        onContextMenu={(e) => onContextMenu(e, track.id)}
        onClick={() => onSelect(track.id)} 
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
            boxShadow: isSelected ? "0 4px 12px rgba(0,0,0,0.6)" : "0 2px 8px rgba(0,0,0,0.3)",
            opacity: effectiveMute ? 0.3 : 1, 
            transition: "all 0.2s",
            cursor: "grab",
            border: isSelected ? "2px solid white" : "none" 
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
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null); 
  const [exportFormat, setExportFormat] = useState("wav"); 
  
  // 🌟 新機能：エフェクトパネルの高さをドラッグで変更するためのステート
  const [fxPanelHeight, setFxPanelHeight] = useState(250);

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
  const selectedTrack = tracks.find(t => t.id === selectedTrackId); 

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
          const timelineVisibleWidth = container.clientWidth - 250;
          const targetScrollLeft = playheadX - (timelineVisibleWidth / 2);
          container.scrollLeft = Math.max(0, targetScrollLeft);
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

  // 🌟 エフェクトパネルの高さリサイズ処理
  const handlePanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = fxPanelHeight;

    const handlePanelResizeMove = (moveEvent: MouseEvent) => {
      const diffY = startY - moveEvent.clientY;
      // 高さは100px〜600pxの間で自由に調整可能！
      setFxPanelHeight(Math.max(100, Math.min(600, startHeight + diffY)));
    };

    const handlePanelResizeEnd = () => {
      window.removeEventListener('mousemove', handlePanelResizeMove);
      window.removeEventListener('mouseup', handlePanelResizeEnd);
    };

    window.addEventListener('mousemove', handlePanelResizeMove);
    window.addEventListener('mouseup', handlePanelResizeEnd);
  };

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
    } catch (e) { alert("保存に失敗しました…。"); }
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
        return { ...rest, url, isMuted: rest.isMuted || false } as Track;
      }));
      setTracks(restoredTracks);
      seekToTime(0);
    } catch (err) { alert("ファイルの読み込みに失敗しました！"); }
    e.target.value = "";
  };

  const exportMixdown = async () => {
    if (tracks.length === 0) return alert("書き出すトラックがありません！");
    const isConfirmed = window.confirm(`全トラックを統合して 【${exportFormat.toUpperCase()}】 形式で書き出しますか？`);
    if (!isConfirmed) return;
    try {
      const totalDur = Math.max(1, ...tracks.map(t => t.offset + t.duration));
      const offlineCtx = new OfflineAudioContext(2, 44100 * totalDur, 44100);
      for (const track of tracks) {
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
        src.connect(panner); panner.connect(gain); gain.connect(offlineCtx.destination);
        src.start(track.offset);
      }
      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWav(renderedBuffer);
      
      const finalBlob = exportFormat === "mp3" ? new Blob([wavBlob], { type: "audio/mp3" }) : wavBlob;
      const fileExt = exportFormat === "mp3" ? "mp3" : "wav";

      const a = document.createElement("a");
      a.href = URL.createObjectURL(finalBlob);
      a.download = `My_Mixdown.${fileExt}`; 
      a.click();
      alert("書き出しが完了しました！");
    } catch (e) { alert("エクスポートに失敗しました。"); }
  };

  const handleImportAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const randomColor = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
    const defaultName = file.name.replace(/\.[^/.]+$/, "");
    const newTrack = { 
      id: Date.now(), url, name: defaultName, color: randomColor,
      volume: 0.8, pan: 0, speed: 1.0, bass: 0, treble: 0, 
      noiseReduce: 0, compressor: 0, chorus: 0, delay: 0, reverb: 0, fadeIn: 0, fadeOut: 0, duration: 0, showFx: false, isSolo: false, isMuted: false, offset: 0, tremolo: 0
    };
    setTracks(prev => [...prev, newTrack]);
    setSelectedTrackId(newTrack.id); 
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
        const newTrack = { 
          id: Date.now(), url, name: `トラック ${tracks.length + 1}`, color: randomColor,
          volume: 0.8, pan: 0, speed: 1.0, bass: 0, treble: 0, 
          noiseReduce: 0, compressor: 0, chorus: 0, delay: 0, reverb: 0, fadeIn: 0, fadeOut: 0, duration: 0, showFx: false, isSolo: false, isMuted: false, offset: globalTime, tremolo: 0 
        };
        setTracks(prev => [...prev, newTrack]);
        setSelectedTrackId(newTrack.id); 
      };
      mediaRecorder.start();
      setIsRecording(true);
      nextClickRef.current = Math.ceil(globalTime / (60 / bpm)) * (60 / bpm);
    } catch (error) { alert("マイクが許可されていません！"); }
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
      if (playheadX < container.scrollLeft || playheadX > container.scrollLeft + container.clientWidth - 250) {
        container.scrollLeft = Math.max(0, playheadX - 100);
      }
    }
  };

  const playAll = () => { setIsPlayingGlobal(true); nextClickRef.current = Math.ceil(globalTime / (60 / bpm)) * (60 / bpm); };
  const stopAll = () => setIsPlayingGlobal(false);

  const handleGlobalTimeBlur = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
    setIsEditingGlobalTime(false);
    const newTime = parseFloat(e.currentTarget.value);
    if (!isNaN(newTime)) seekToTime(Math.max(0, newTime)); 
  };

  const deleteTrack = (id: number) => {
    setTracks(tracks.filter(t => t.id !== id));
    if (selectedTrackId === id) setSelectedTrackId(null);
  };
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
      const newBuffer = ctx.createBuffer(audioBuffer.numberOfChannels, audioBuffer.length * times, audioBuffer.sampleRate);
      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        const channelData = audioBuffer.getChannelData(c);
        const newChannelData = newBuffer.getChannelData(c);
        for (let i = 0; i < times; i++) { newChannelData.set(channelData, i * audioBuffer.length); }
      }
      const wavBlob = audioBufferToWav(newBuffer);
      updateTrack(track.id, 'url', URL.createObjectURL(wavBlob));
      updateTrack(track.id, 'duration', audioBuffer.duration * times);
    } catch (err) { alert("ループ処理に失敗しました！"); }
  };

  const timelineTicks = [];
  for (let i = 0; i <= maxDuration + 20; i++) timelineTicks.push(i);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#111", color: "white", fontFamily: "'Inter', sans-serif" }}>
      
      {/* 🔴 上部ツールバー */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1a1a1a", padding: "15px 20px", borderBottom: "1px solid #333", boxShadow: "0 4px 6px rgba(0,0,0,0.3)", zIndex: 100 }}>
        
        {/* 左側：ファイル管理 */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input type="file" id="load-project" accept=".daw" style={{ display: 'none' }} onChange={loadProject} />
          <button onClick={saveProject} className="tooltip" data-tooltip="プロジェクト保存" style={{ display: "flex", alignItems: "center", gap: "6px", background: "#252525", color: "#ddd", padding: "8px 12px", border: "1px solid #333", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}><Save size={16} /> 保存</button>
          <button onClick={() => document.getElementById('load-project')?.click()} className="tooltip" data-tooltip="プロジェクト読込" style={{ display: "flex", alignItems: "center", gap: "6px", background: "#252525", color: "#ddd", padding: "8px 12px", border: "1px solid #333", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}><FolderOpen size={16} /> 読込</button>
          
          <div style={{ width: "1px", height: "24px", background: "#444", margin: "0 5px" }}></div>
          
          <div style={{ display: "flex", alignItems: "center", background: "#252525", padding: "2px", borderRadius: "6px", border: "1px solid #333", gap: "4px" }}>
            <select 
              value={exportFormat} 
              onChange={e => setExportFormat(e.target.value)}
              style={{ background: "transparent", color: "white", border: "none", outline: "none", padding: "4px 8px", fontSize: "13px", fontWeight: "bold", cursor: "pointer" }}
            >
              <option value="wav" style={{ background: "#252525", color: "white" }}>WAV</option>
              <option value="mp3" style={{ background: "#252525", color: "white" }}>MP3</option>
            </select>
            <button onClick={exportMixdown} className="tooltip" data-tooltip="完成した曲を出力" style={{ display: "flex", alignItems: "center", gap: "6px", background: "linear-gradient(135deg, #f1c40f, #f39c12)", color: "#111", padding: "8px 12px", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}><Download size={16} /> 書き出し</button>
          </div>

          <input type="file" id="import-audio" accept="audio/*" style={{ display: 'none' }} onChange={handleImportAudio} />
          <button onClick={() => document.getElementById('import-audio')?.click()} className="tooltip" data-tooltip="音源を読込" style={{ display: "flex", alignItems: "center", gap: "6px", background: "#3498db", color: "white", padding: "8px 12px", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}><Music size={16} /> 音源追加</button>
        </div>

        {/* 中央：操作のコア */}
        <div style={{ display: "flex", alignItems: "center", gap: "15px", background: "#000", padding: "8px 20px", borderRadius: "12px", border: "1px solid #333", boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)" }}>
          <button onClick={() => seekToTime(0)} className="tooltip" data-tooltip="最初に戻る" style={{ background: "transparent", color: "#aaa", border: "none", cursor: "pointer", padding: "5px" }}><SkipBack size={20} /></button>
          {isPlayingGlobal ? (
            <button onClick={stopAll} style={{ background: "#e74c3c", color: "white", padding: "10px", border: "none", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px" }}><Square size={20} fill="currentColor" /></button>
          ) : (
            <button onClick={playAll} style={{ background: "#2ecc71", color: "white", padding: "10px", border: "none", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px" }}><Play size={22} fill="currentColor" style={{ marginLeft: "4px" }} /></button>
          )}
          
          <div className="tooltip" data-tooltip="クリックで時間指定" style={{ width: "130px", textAlign: "center", cursor: "text" }} onClick={() => { if (!isRecording && !isPlayingGlobal) setIsEditingGlobalTime(true); }}>
            {isEditingGlobalTime ? (
              <input type="number" step="0.1" defaultValue={globalTime.toFixed(1)} onBlur={handleGlobalTimeBlur} onKeyDown={(e) => { if (e.key === 'Enter') handleGlobalTimeBlur(e); }} autoFocus style={{ color: "#2ecc71", fontFamily: "monospace", fontSize: "24px", letterSpacing: "1px", background: "transparent", border: "none", textAlign: "center", width: "100%", outline: "none" }} />
            ) : (
              <span style={{ color: isRecording ? "#e74c3c" : "#2ecc71", fontFamily: "monospace", fontSize: "26px", letterSpacing: "1px", textShadow: "0 0 8px rgba(46,204,113,0.4)" }}>{formatTime(globalTime)}</span>
            )}
          </div>

          {!isRecording ? (
            <button onClick={startRecording} className="tooltip" data-tooltip="録音開始" style={{ background: "transparent", color: "#e74c3c", border: "2px solid #e74c3c", borderRadius: "50%", cursor: "pointer", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center" }}><Mic size={20} /></button>
          ) : (
            <button onClick={stopRecording} className="tooltip" data-tooltip="録音停止" style={{ background: "#e74c3c", color: "white", border: "none", borderRadius: "50%", cursor: "pointer", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 1s infinite" }}><Square size={16} fill="currentColor" /></button>
          )}
        </div>

        {/* 右側：全体設定 */}
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "#252525", padding: "6px 12px", borderRadius: "6px", border: "1px solid #333" }}>
            <span style={{ fontSize: "12px", color: "#888", fontWeight: "bold" }}>BPM</span>
            <input type="number" value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ width: "40px", background: "transparent", color: "white", border: "none", outline: "none", fontSize: "14px", fontWeight: "bold" }} />
            <div style={{ width: "1px", height: "16px", background: "#444", margin: "0 5px" }}></div>
            <button onClick={() => setMetronomeOn(!metronomeOn)} className="tooltip" data-tooltip="メトロノーム" style={{ background: "transparent", color: metronomeOn ? "#2ecc71" : "#888", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
              {metronomeOn ? <Bell size={18} /> : <BellOff size={18} />}
            </button>
          </div>
          
          <div className="tooltip" data-tooltip="マスター音量" style={{ display: "flex", alignItems: "center", gap: "8px", background: "#252525", padding: "6px 12px", borderRadius: "6px", border: "1px solid #333" }}>
            <Volume2 size={16} color="#888" />
            <input type="range" min="0" max="1" step="0.01" value={masterVolume} onChange={(e) => setMasterVolume(parseFloat(e.target.value))} style={{ width: "70px", cursor: "pointer", accentColor: "#aaa" }} />
          </div>
        </div>
      </div>

      {/* 📦 メインワークスペース */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflowX: "auto", overflowY: "auto", position: "relative", background: "#111" }}>
        <div style={{ minWidth: `calc(250px + ${Math.max(15, maxDuration) * 50}px)`, position: "relative", paddingBottom: "50px" }}>
          
          <div style={{ display: "flex", background: "#1a1a1a", borderBottom: "1px solid #333", position: "sticky", top: 0, zIndex: 20 }}>
            <div style={{ width: "250px", flexShrink: 0, position: "sticky", left: 0, zIndex: 30, background: "#1a1a1a", borderRight: "1px solid #222", display: "flex", alignItems: "center", padding: "0 15px", color: "#888", fontSize: "12px", fontWeight: "bold" }}>
              TIMELINE
            </div>
            <div style={{ flex: 1, position: "relative", height: "30px" }}>
              {timelineTicks.map(t => (
                <div key={t} style={{ position: "absolute", left: `${t * 50}px`, top: t % 5 === 0 ? "0" : "15px", height: t % 5 === 0 ? "30px" : "15px", color: "#666", fontSize: "10px", borderLeft: t % 5 === 0 ? "1px solid #555" : "1px solid #333", paddingLeft: "4px" }}>
                  {t % 5 === 0 && `${t}s`}
                </div>
              ))}
            </div>
          </div>

          {tracks.map(track => (
            <TrackItem 
              key={track.id} track={track} 
              isSelected={selectedTrackId === track.id} 
              hasSolo={hasSolo} masterVolume={masterVolume} globalTime={globalTime} isPlayingGlobal={isPlayingGlobal} 
              onSelect={setSelectedTrackId} onDelete={deleteTrack} onDuplicate={duplicateTrack} onUpdate={updateTrack} onContextMenu={handleContextMenu} 
            />
          ))}

          <div style={{ height: "200px" }}></div>

          <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(250px + ${globalTime * 50}px)`, width: "2px", background: "#2ecc71", zIndex: 50, pointerEvents: "none", boxShadow: "0 0 8px rgba(46, 204, 113, 0.8)", display: globalTime > 0 ? "block" : "none" }}>
            <div style={{ position: "absolute", top: 0, left: "-6px", width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "12px solid #2ecc71" }} />
          </div>

        </div>
      </div>

      {/* 🎛️ エフェクト専用パネル（ドラッグでリサイズ対応！） */}
      <div style={{ height: `${fxPanelHeight}px`, flexShrink: 0, background: "#1a1a1a", display: "flex", flexDirection: "column", zIndex: 100, boxShadow: "0 -4px 10px rgba(0,0,0,0.3)", position: "relative" }}>
        
        {/* ↕️ 上部リサイズハンドル */}
        <div 
          onMouseDown={handlePanelResizeStart}
          style={{ background: "#222", padding: "4px 15px", fontSize: "12px", fontWeight: "bold", color: "#888", borderTop: "1px solid #333", borderBottom: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "row-resize" }}
          title="ドラッグして高さを調整"
        >
          <div style={{ position: "absolute", left: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
             <Sliders size={14} /> EFFECT CONTROLS
          </div>
          <div style={{ width: "40px", height: "4px", background: "#555", borderRadius: "2px" }} />
        </div>
        
        {selectedTrack ? (
          <div style={{ flex: 1, padding: "15px", display: "flex", gap: "20px", overflowX: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "200px", borderRight: "1px solid #333", paddingRight: "20px" }}>
              <div style={{ color: selectedTrack.color, fontWeight: "bold", fontSize: "16px", marginBottom: "5px" }}>{selectedTrack.name}</div>
              {/* Pan はここから削除済み！ */}
              <EffectKnob label="⏩ 再生速度" min="0.5" max="2" step="0.01" value={selectedTrack.speed} onChange={(v) => updateTrack(selectedTrack.id, 'speed', v)} unit="x" defaultValue={1} />
            </div>

            <div style={{ display: "flex", gap: "15px", flex: 1 }}>
              <div style={{ width: "160px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <EffectKnob label="🎚️ 低音 (Bass)" min="-15" max="15" step="1" value={selectedTrack.bass} onChange={(v) => updateTrack(selectedTrack.id, 'bass', v)} unit="dB" defaultValue={0} />
                <EffectKnob label="🎚️ 高音 (Treble)" min="-15" max="15" step="1" value={selectedTrack.treble} onChange={(v) => updateTrack(selectedTrack.id, 'treble', v)} unit="dB" defaultValue={0} />
              </div>
              <div style={{ width: "160px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <EffectKnob label="🗜️ コンプレッサー" min="0" max="1" step="0.01" value={selectedTrack.compressor} onChange={(v) => updateTrack(selectedTrack.id, 'compressor', v)} defaultValue={0} />
                <EffectKnob label="🧹 ノイズ除去" min="0" max="1" step="0.01" value={selectedTrack.noiseReduce} onChange={(v) => updateTrack(selectedTrack.id, 'noiseReduce', v)} defaultValue={0} />
              </div>
              <div style={{ width: "160px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <EffectKnob label="🌌 リバーブ" min="0" max="1" step="0.01" value={selectedTrack.reverb} onChange={(v) => updateTrack(selectedTrack.id, 'reverb', v)} defaultValue={0} />
                <EffectKnob label="🔂 ディレイ" min="0" max="1" step="0.01" value={selectedTrack.delay} onChange={(v) => updateTrack(selectedTrack.id, 'delay', v)} defaultValue={0} />
              </div>
              <div style={{ width: "160px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <EffectKnob label="👥 コーラス" min="0" max="1" step="0.01" value={selectedTrack.chorus} onChange={(v) => updateTrack(selectedTrack.id, 'chorus', v)} defaultValue={0} />
                <EffectKnob label="🌊 トレモロ" min="0" max="1" step="0.01" value={selectedTrack.tremolo} onChange={(v) => updateTrack(selectedTrack.id, 'tremolo', v)} defaultValue={0} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: "14px", fontWeight: "bold" }}>
            波形（クリップ）をクリックして、トラックを選択してください
          </div>
        )}
      </div>

      {contextMenu && (
        <div style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, background: "#252525", border: "1px solid #444", borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 99999, padding: "5px 0", minWidth: "160px" }}>
          <div style={{ padding: "8px 15px", color: "#888", fontSize: "11px", borderBottom: "1px solid #333", marginBottom: "5px", fontWeight: "bold" }}>音声の編集</div>
          <button onClick={() => loopTrackAudio(contextMenu.trackId, 2)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", color: "#ddd", border: "none", padding: "10px 15px", cursor: "pointer", fontSize: "13px" }} onMouseOver={e => e.currentTarget.style.background = "#333"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>🔁 2倍にループ複製</button>
          <button onClick={() => loopTrackAudio(contextMenu.trackId, 4)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", color: "#ddd", border: "none", padding: "10px 15px", cursor: "pointer", fontSize: "13px" }} onMouseOver={e => e.currentTarget.style.background = "#333"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>🔁 4倍にループ複製</button>
        </div>
      )}
      
    </div>
  );
}

export default App;