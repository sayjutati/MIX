type Props = {
  playing: boolean;
  tempo: number;
  playheadBeat: number;
  loopStart: number;
  loopEnd: number;
  onPlay: () => void;
  onStop: () => void;
  onTempoChange: (tempo: number) => void;
};

export function TransportBar({
  playing,
  tempo,
  playheadBeat,
  loopStart,
  loopEnd,
  onPlay,
  onStop,
  onTempoChange,
}: Props) {
  return (
    <header className="transport">
      <div className="transport__brand">MIX DTM</div>
      <div className="transport__controls">
        {playing ? (
          <button type="button" className="transport__btn transport__btn--stop" onClick={onStop}>
            ■ Stop
          </button>
        ) : (
          <button type="button" className="transport__btn transport__btn--play" onClick={onPlay}>
            ▶ Play
          </button>
        )}
      </div>
      <label className="transport__tempo">
        BPM
        <input
          type="number"
          min={20}
          max={300}
          value={tempo}
          onChange={(e) => onTempoChange(Number(e.target.value) || 120)}
        />
      </label>
      <div className="transport__info">
        <span>
          Bar {Math.floor(playheadBeat / 4) + 1}.{Math.round((playheadBeat % 4) * 4)}
        </span>
        <span className="transport__loop">
          Loop {loopStart}–{loopEnd}
        </span>
      </div>
    </header>
  );
}
