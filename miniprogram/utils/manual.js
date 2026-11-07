// 使用说明页（pages/manual）的内容：怎么用、能得到什么。数字都从规则里取（暖豆、扭蛋价钱、饭点），规则改了这里跟着变。纯函数，有单测
const { BEANS } = require('./shared/forest')
const { SPIN_COST, WELCOME_BEANS } = require('./shared/garden')
const { PETS } = require('./shared/pets')
const { MAIN_MEALS, MEAL_WORDS, windowText, mealTimesOf } = require('./shared/timing')
const { MILESTONES } = require('./shared/streak')

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
      emoji: '⏰',
      title: '按饭点拍，算准时',
      lines: [
        `饭点前后一小时内拍算准时：${windows}。`,
        '过了饭点也能补拍，热量照样算，只是暖豆少一点。',
        '饭点在「我的」里改；「我的」→「饭点提醒」能在手机日历里加三个闹钟，到点就响。',
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
        '暖豆拿去营地，养小动物、买家具。',
      ],
    },
    {
      key: 'fix',
      emoji: '✏️',
      title: '估得不准怎么办',
      lines: [
        '在结果页点一道菜，拖一拖改成你实际吃的量，热量跟着变。',
        '和家里人一起吃的，点「几个人一起吃」，小暖只算你那一份。',
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
      key: 'weight',
      emoji: '⚖️',
      title: '体重',
      lines: ['「体重」里隔几天记一次，看曲线是不是往下走。记了新体重，每天建议吃多少也跟着调。'],
    },
  ]
}

module.exports = { manualSections, DAY_MAX }
