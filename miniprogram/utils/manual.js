// 使用说明页（pages/manual）的内容：怎么用、能得到什么。数字都从规则里取（暖豆、扭蛋价钱、饭点），规则改了这里跟着变。纯函数，有单测
const { BEANS } = require('./shared/forest')
const { SPIN_COST, WELCOME_BEANS } = require('./shared/garden')
const { PETS } = require('./shared/pets')
const { MAIN_MEALS, MEAL_WORDS, windowText, mealTimesOf } = require('./shared/timing')
const { MILESTONES, PATCH } = require('./shared/streak')

// 一天最多得多少暖豆：三顿都准时、都吃得好，再加三顿全准时
const DAY_MAX = MAIN_MEALS.length * (BEANS.onTime + BEANS.green) + BEANS.allOnTime

// times：她设的饭点（没有就按默认的）
function manualSections(times) {
  const t = mealTimesOf(times ? { mealTimes: times } : null)
  const windows = MAIN_MEALS.map((m) => `${MEAL_WORDS[m]} ${windowText(m, t)}`).join('，')
  return [
    {
      key: 'photo',
      icon: '/images/garden/ui/camera.png',
      title: '每顿饭，拍一张',
      lines: [
        '吃饭前，点「今日」最上面的大按钮（到哪顿就写「拍午饭」「拍晚饭」）。',
        '把一桌菜都拍进去，旁边放双筷子或勺子，小暖估得更准。',
        '不方便拍照，写一句「一碗米饭、半盘青菜」也行。',
        '点「交给小暖看看」，等十几秒，小暖告诉你吃了多少千卡、吃得好不好、下一顿怎么吃。',
      ],
    },
    {
      key: 'time',
      icon: '/images/icons/clock.svg',
      title: '按饭点拍，算准时',
      lines: [
        `饭点前后一小时内拍算准时：${windows}。`,
        '过了饭点也能补拍，热量照样算，只是暖豆少一点。',
        '饭点在「我的」里改；「我的」→「饭点提醒」打开微信提醒，到饭点还没拍，微信「服务通知」里会叫你，点开就是拍照页。',
      ],
    },
    {
      key: 'beans',
      icon: '/images/garden/ui/bean.png',
      title: '能得到什么',
      lines: [
        `准时拍一顿得 ${BEANS.onTime} 暖豆，不在饭点拍得 ${BEANS.offTime} 暖豆。`,
        `这顿吃得好（小暖说「吃得好」），再加 ${BEANS.green}；三顿都准时，再加 ${BEANS.allOnTime}。一天最多 ${DAY_MAX} 暖豆。`,
        '每顿盖一个印章，准时的印章是金边、带个「准」字。',
        `天天打卡，连着 ${MILESTONES.slice(0, 5).join('、')} 天……能拿纪念章，在营地的「日历」里看。`,
        `漏了一天不用慌：第二天首页会问要不要用 ${PATCH.cost} 暖豆补上（只能补昨天，一个月 ${PATCH.perMonth} 次），连续天数接着算。`,
        '每周一出上周的小结：打卡几天、准时几顿、每天吃了多少，在「我的 → 每周小结」随时能看。',
        '拍完晚饭，小暖会自己写一段今天的总结。',
        '暖豆拿去营地，养小动物、买家具。',
      ],
    },
    {
      key: 'fix',
      icon: '/images/icons/pencil.svg',
      title: '估得不准怎么办',
      lines: [
        '在结果页点一道菜，拖一拖改成你实际吃的量，热量跟着变。标着「拿不准」的是小暖没看清的，点开看一眼。',
        '和别人一起吃的，点「几个人一起吃」，小暖只算你那一份；吃得比别人少或多，再点一下「和大家比，我吃得」。把自己要吃的夹到碗里再拍最准，这时候选「就我」。',
        '菜多的聚餐：点「有几道没吃？」一次去掉没动筷子的；喝的酒和饮料照片拍不到，在备注里写一句。',
        '没吃完的，在「吃完了吗？」点「剩了一点」或「剩了一半」。',
        '你改过的份量小暖会记住，下次估得更准。',
        '拍错了，结果页最下面「删除这条打卡」，重新拍一张。',
      ],
    },
    {
      key: 'camp',
      icon: '/images/garden/ui/campfire.png',
      title: '暖暖营地：用暖豆养小动物',
      lines: [
        `第一次进营地送 ${WELCOME_BEANS} 暖豆，豆豆已经在篝火边等你了。`,
        `「扭蛋」：${SPIN_COST} 暖豆抽一样好吃的，放进背包。`,
        '点营地中间的锅，选一样放进去，火就点起来了。一天最多煮三样。',
        `锅里的香味会引来爱吃它的小动物（一共 ${PETS.length} 只），锅里有吃的它就待着：一样吃的管 8 小时，锅空了没住下的就回去，再煮它爱吃的又来。`,
        '每来一次、每喂一次都更亲；拍正餐时在营地的小动物也算喂了一顿。亲密到 5 级就住下，锅空了也不走。小鸡豆豆一直陪着你。',
        '每次拍正餐都算喂它们一顿，越喂越亲：会换睡姿、做小动作，「图册」里能看它们的小故事。',
        '点小动物它会跟你说话；早上有时会叼着礼物来，点它收下。',
        '「商店」里用暖豆买秋千、花、小灯笼，拖到草地上摆好，小动物会去玩。',
      ],
    },
    {
      key: 'family',
      icon: '/images/icons/users.svg',
      title: '亲友看板：让亲友看看、帮着盯一盯',
      lines: [
        '「我的」→「亲友看板」→「邀请亲友看我的打卡」，把卡片发给亲友，TA 点开填个称呼就行，不用另外注册。',
        '亲友能看到你今天每一顿吃了什么、准不准时、连续几天，还能给你点赞；赞会显示在你那顿打卡下面。',
        '亲友可以打开「TA 过了饭点没拍，提醒我」，到时候微信会通知 TA 来催你。',
        '不想让谁看了，在「我的」→「亲友看板」里移除；别人只看得到当天的打卡，看不到你的体重和档案。',
      ],
    },
    {
      key: 'weight',
      icon: '/images/icons/scale.svg',
      title: '体重',
      lines: ['「体重」里隔几天记一次，看曲线是不是往下走。记了新体重，每天建议吃多少也跟着调。'],
    },
  ]
}

module.exports = { manualSections, DAY_MAX }
