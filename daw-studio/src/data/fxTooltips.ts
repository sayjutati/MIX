/** エフェクトパネル用 — 初心者向け説明文 */
export type FxTooltip = { title: string; description: string };

export const FX_TOOLTIPS = {
  nudgeMs: {
    title: "タイミング補正",
    description:
      "BGMと歌・録音のズレを0.1ms単位で微調整します。再生して遅れて聞こえるときはマイナス、早いときはプラスへ。",
  },
  speed: {
    title: "再生速度",
    description:
      "曲の速さを変えます。1.00xが原曲どおり。速く/遅くして歌いやすいテンポに合わせられます（音程は別の「キー変更」で調整）。",
  },
  pitch: {
    title: "キー変更",
    description:
      "音の高さ（キー）だけを変えます。±12で1オクターブ。男性/keyが合わないときに±1〜3程度から試してください。速度は変わりません。",
  },
  pan: {
    title: "Pan（定位）",
    description:
      "音を左・右どちらに寄せるか決めます。C=中央、L=左、R=右。ボーカルを真ん中、オケを少し広げるなどに使います。",
  },
  bass: {
    title: "低音（Bass）",
    description:
      "低い音域を強くしたり弱くしたりします。声やベースを太く聞かせたいときはプラス、こもりを減らすときはマイナス。",
  },
  treble: {
    title: "高音（Treble）",
    description:
      "高い音域を調整します。声を明るくハキッとさせたいときはプラス、キンキンする・歯擦音が目立つときはマイナス。",
  },
  compressor: {
    title: "コンプレッサー",
    description:
      "大きすぎる音を抑えて、全体の音量バランスを整えます。歌がオケに埋もれない・はっきり乗るようにしたいときに使います。",
  },
  noiseReduce: {
    title: "ノイズ除去",
    description:
      "エアコンやPCファンなどの低いノイズ、うっすらした環境音を弱めます。上げすぎると声がカスカスになるので少しずつ。",
  },
  reverb: {
    title: "リバーブ",
    description:
      "残響（響き）を足して、スタジオやホールのような空間感を出します。歌ってみたで自然な距離感を出すのに便利です。",
  },
  delay: {
    title: "ディレイ",
    description:
      "音のコピーを少し遅れて繰り返すエコー効果です。リバーブよりはっきりした反響・広がりを付けたいときに。",
  },
  chorus: {
    title: "コーラス",
    description:
      "同じ音を少しずらして重ね、厚みや広がりを足します。1人で録音した声を少しリッチに聞かせたいときに。",
  },
  tremolo: {
    title: "トレモロ",
    description:
      "音量を一定のリズムで揺らします。特殊効果向け。通常の歌ってみたでは0のままで問題ありません。",
  },
  fadeIn: {
    title: "フェードイン",
    description:
      "トラックの始まりを徐々に大きくします。いきなり音が入るのを防ぎ、自然な立ち上がりにできます。",
  },
  fadeOut: {
    title: "フェードアウト",
    description:
      "トラックの終わりを徐々に小さくします。急に切れるのを防ぎ、自然に終わらせられます。",
  },
} as const satisfies Record<string, FxTooltip>;
