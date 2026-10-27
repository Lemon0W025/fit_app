// 拆成两层的装饰（scripts/camp/swing_parts.py 回写）：云端高清块里有 <id>-frame.png（不动的架子）和 <id>-seat.png（会摆的那层），
// pivot 是会摆的那层的轴（块里的比例），kind 是怎么摆（swing 秋千荡、rock 吊床轻轻晃，camp.wxss 的 sway-on / rock-on）。
// 只有用云端高清块时才拆；包里的小图还是一整张
module.exports = {"swing": {"pivot": [0.4896, 0.2637], "kind": "swing"}, "gold_swing": {"pivot": [0.4896, 0.2637], "kind": "swing"}, "hammock": {"pivot": [0.5035, 0.5659], "kind": "rock"}}
