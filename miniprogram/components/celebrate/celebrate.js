// 庆祝：burst 只撒一把彩带（三顿都准时，不挡点击，播完自己关）；
// milestone 是连续打卡里程碑的整张庆祝卡（暗一下 + 彩带 + 纪念章 + 最亲的小动物 + 小暖的话），点按钮或卡片外面关
const C = require('../../utils/confetti')
const { clockOf, buzz } = require('../../utils/fx')

Component({
  properties: {
    mode: { type: String, value: '' },
    milestone: { type: Object, value: null },
  },

  lifetimes: {
    attached() {
      this.start()
    },
    detached() {
      this.stop()
    },
  },

  methods: {
    start() {
      const mode = this.data.mode
      if (!mode) return
      const clock = clockOf(this)
      this.timers = []
      // 纪念章转着落定的时候震一下
      if (mode === 'milestone') this.timers.push(clock.set(() => buzz('medium'), 400))
      if (mode === 'burst') this.timers.push(clock.set(() => this.close(), C.RUN_MS.burst))
      this.startConfetti(mode)
    },

    // 拿 canvas 画彩带；老基础库拿不到就只显示卡片
    startConfetti(mode) {
      this.createSelectorQuery()
        .select('#confetti')
        .fields({ node: true, size: true })
        .exec((res) => {
          const hit = res && res[0]
          if (!hit || !hit.node || !hit.node.getContext || this.stopped) return
          const canvas = hit.node
          const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
          canvas.width = hit.width * dpr
          canvas.height = hit.height * dpr
          const ctx = canvas.getContext('2d')
          ctx.scale(dpr, dpr)
          const list = C.makeParticles({ mode, width: hit.width, height: hit.height, seed: Date.now() })
          const t0 = Date.now()
          let prev = t0
          const tick = () => {
            if (this.stopped) return
            const now = Date.now()
            const alive = C.step(list, Math.min(0.05, (now - prev) / 1000), hit.height)
            prev = now
            ctx.clearRect(0, 0, hit.width, hit.height)
            C.draw(ctx, list)
            if (alive && now - t0 < C.RUN_MS[mode]) this.raf = canvas.requestAnimationFrame(tick)
            else ctx.clearRect(0, 0, hit.width, hit.height)
          }
          this.canvas = canvas
          this.raf = canvas.requestAnimationFrame(tick)
        })
    },

    stop() {
      this.stopped = true
      const clock = clockOf(this)
      ;(this.timers || []).forEach((h) => clock.clear(h))
      this.timers = []
      if (this.canvas && this.raf) this.canvas.cancelAnimationFrame(this.raf)
      this.raf = null
    },

    close() {
      this.stop()
      this.triggerEvent('close', {})
    },

    noop() {},
  },
})
