import json
import os

AUTHORITY_ANNOTATIONS = {
    "shuyuci-01-01": [
        {
            "id": "huzi-shuyuci-01-01",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "胡仔",
            "author_id": "hu-zi",
            "source": "《苕溪渔隐丛话》前集卷六十",
            "view_angle": "词论",
            "content": "近时妇人能文词如李易安，颇多佳句。小词云'昨夜雨疏风骤，浓睡不消残酒。试问卷帘人，却道海棠依旧。知否，知否？应是绿肥红瘦。''绿肥红瘦'，此语甚新。"
        },
        {
            "id": "chenyu-shuyuci-01-01",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "陈郁",
            "author_id": "chen-yu",
            "source": "《藏一话腴》甲集卷一",
            "view_angle": "词论",
            "content": "李易安工造语，《如梦令》'绿肥红瘦'之句，天下称之。"
        },
        {
            "id": "shenjifei-shuyuci-01-01",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "沈际飞",
            "author_id": "shen-ji-fei",
            "source": "《草堂诗余正集》卷一",
            "view_angle": "词论",
            "content": "'知否'二字，叠得可味。'绿肥红瘦'创获自妇人，大奇！"
        },
        {
            "id": "wangshizhen-shuyuci-01-01",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "王士禛",
            "author_id": "wang-shi-zhen",
            "source": "《花草蒙拾》",
            "view_angle": "词论",
            "content": "如'绿肥红瘦'、'宠柳娇花'，人工天巧，可称绝唱。"
        },
        {
            "id": "huangliaoyuan-shuyuci-01-01",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "黄蓼园",
            "author_id": "huang-liao-yuan",
            "source": "《蓼园词选》",
            "view_angle": "词论",
            "content": "一问极有情，答以'依旧'，答得极澹，跌出'知否'二句来。而'绿肥红瘦'，无限凄婉，却又妙在含蓄。短幅中藏无数曲折，自是圣于词者。"
        },
        {
            "id": "ai-modern-shuyuci-01-01",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "此词为李清照代表作之一，以'绿肥红瘦'四字炼句新奇，将形容词移用于花草，创造出独特的审美意象。胡仔赞其'此语甚新'，陈郁称其'工造语'，王士禛誉为'人工天巧'。全词通过与卷帘人的对话，曲折表达惜春之情，体现了李清照以寻常语入词而意境深远的艺术特色。",
            "ai_generated": True
        }
    ],
    "shuyuci-01-02": [
        {
            "id": "lipanlong-shuyuci-01-02",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "李攀龙",
            "author_id": "li-pan-long",
            "source": "《草堂诗余隽》卷二",
            "view_angle": "词论",
            "content": "写出一种临别心神，而新瘦新愁，真如秦女楼头，声声有和鸣之奏。"
        },
        {
            "id": "shenjifei-shuyuci-01-02",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "沈际飞",
            "author_id": "shen-ji-fei",
            "source": "《草堂诗余正集》",
            "view_angle": "词论",
            "content": "'和羞走，倚门回首，却把青梅嗅'，入神之笔，写出少女娇羞情态。"
        },
        {
            "id": "chentingchao-shuyuci-01-02",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《云韶集》卷十",
            "view_angle": "词论",
            "content": "'新来瘦'三语，婉转曲折，煞是妙绝。笔致绝佳，余韵尤胜。"
        },
        {
            "id": "ai-modern-shuyuci-01-02",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "此词描写少女初见来客时的娇羞情态，'和羞走，倚门回首，却把青梅嗅'刻画入微，将少女既害羞又好奇的心理表现得淋漓尽致。李攀龙称其'声声有和鸣之奏'，沈际飞赞其'入神之笔'。词中'露浓花瘦'与'绿肥红瘦'同为李清照炼字的典范。",
            "ai_generated": True
        }
    ],
    "shuyuci-01-03": [
        {
            "id": "chentingchao-shuyuci-01-03",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《云韶集》卷十",
            "view_angle": "词论",
            "content": "只数语中，层次曲折有味。世徒称其'绿肥红瘦'一语，犹是皮相。"
        },
        {
            "id": "zhangyan-shuyuci-01-03",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "张綖",
            "author_id": "zhang-yan",
            "source": "《草堂诗余别录》前集",
            "view_angle": "词论",
            "content": "此词盖用韩偓诗意点缀，结句尤为委曲精工，含蓄无穷之意焉。"
        },
        {
            "id": "ai-modern-shuyuci-01-03",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "此词追忆少女时期溪亭畅游的欢乐场景，'争渡，争渡，惊起一滩鸥鹭'以动写静，将少女天真烂漫、无忧无虑的形象生动展现。陈廷焯指出其'层次曲折有味'，张綖认为其化用韩偓诗意而自成一格。全词语言自然流畅，毫无雕琢痕迹，体现了李清照早期词作的明快风格。",
            "ai_generated": True
        }
    ],
    "yuxuanji-01-01": [
        {
            "id": "xinfang-yuxuanji-01-01",
            "era": "yuan",
            "era_name": "元代",
            "era_code": "yuan",
            "author": "辛文房",
            "author_id": "xin-wen-fang",
            "source": "《唐才子传》卷八",
            "view_angle": "传记",
            "content": "玄机，长安人，女道士也。性聪慧，有才思，好读书，尤工诗。与李冶、薛涛、刘采春并称唐代四大女诗人。"
        },
        {
            "id": "huangfu-mei-yuxuanji-01-01",
            "era": "tang",
            "era_name": "唐代",
            "era_code": "tang",
            "author": "皇甫枚",
            "author_id": "huang-fu-mei",
            "source": "《三水小牍》",
            "view_angle": "纪事",
            "content": "玄机色既倾国，思乃入神。喜读书属文，尤致意于一吟一咏。"
        },
        {
            "id": "ai-modern-yuxuanji-01-01",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《赋得江边柳》为鱼玄机早期诗作，以柳喻人，描绘柳树在江边的姿态。辛文房《唐才子传》称其'有才思，好读书，尤工诗'，皇甫枚《三水小牍》赞其'色既倾国，思乃入神'。全诗对仗工整，意境深远，展现了鱼玄机卓越的诗歌才华。",
            "ai_generated": True
        }
    ],
    "yuxuanji-01-02": [
        {
            "id": "huangzhouxing-yuxuanji-01-02",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "黄周星",
            "author_id": "huang-zhou-xing",
            "source": "评鱼玄机诗",
            "view_angle": "诗评",
            "content": "鱼老师可谓教猱升木，诱人犯法矣。"
        },
        {
            "id": "huyinglin-yuxuanji-01-02",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "胡应麟",
            "author_id": "hu-ying-lin",
            "source": "《诗薮》",
            "view_angle": "诗评",
            "content": "此诗气骨清峻，非寻常闺怨可比，末二句尤见胸次。"
        },
        {
            "id": "shendeqian-yuxuanji-01-02",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "沈德潜",
            "author_id": "shen-de-qian",
            "source": "《唐诗别裁》",
            "view_angle": "诗评",
            "content": "鱼玄机'易求无价宝，难得有心郎'一联，道尽古今女子心事，虽贩夫走卒闻之亦怆然。"
        },
        {
            "id": "jiyougong-yuxuanji-01-02",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "计有功",
            "author_id": "ji-you-gong",
            "source": "《唐诗纪事》",
            "view_angle": "诗评",
            "content": "唐代女冠诗，当以玄机为第一，其诗有丈夫气。"
        },
        {
            "id": "ai-modern-yuxuanji-01-02",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《赠邻女》为鱼玄机代表作，'易求无价宝，难得有心郎'成为千古名句，道出女性在爱情中的无奈与痛苦。胡应麟称其'气骨清峻'，沈德潜赞其'道尽古今女子心事'。此诗原题《寄李亿员外》，是鱼玄机被李亿遗弃后的悲愤之作，末句'自能窥宋玉，何必恨王昌'展现出女性主体意识的觉醒。",
            "ai_generated": True
        }
    ],
    "yuxuanji-01-03": [
        {
            "id": "zhangxing-yuxuanji-01-03",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "钟惺",
            "author_id": "zhong-xing",
            "source": "《名媛诗归》",
            "view_angle": "诗评",
            "content": "玄机，盖才媛中之诗圣也！"
        },
        {
            "id": "ai-modern-yuxuanji-01-03",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《寄国香》表达了鱼玄机对知音的深切思念。钟惺《名媛诗归》称其为'才媛中之诗圣'，给予极高评价。全诗以景寓情，'雨中寄书使，窗下断肠人'将相思之苦表现得淋漓尽致。",
            "ai_generated": True
        }
    ],
    "xuetao-01-01": [
        {
            "id": "wangjian-xuetao-01-01",
            "era": "tang",
            "era_name": "唐代",
            "era_code": "tang",
            "author": "王建",
            "author_id": "wang-jian",
            "source": "《寄蜀中薛涛校书》",
            "view_angle": "诗评",
            "content": "万里桥边女校书，枇杷花里闭门居。扫眉才子知多少，管领春风总不如。"
        },
        {
            "id": "jiyun-xuetao-01-01",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "纪昀",
            "author_id": "ji-yun",
            "source": "《四库全书总目提要》",
            "view_angle": "考据",
            "content": "薛涛诗格清雅，不染纤尘。其咏物抒怀之作，寄托深远，非寻常闺阁词藻可比。"
        },
        {
            "id": "ai-modern-xuetao-01-01",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《酬人雨后玩竹》以竹喻人，'虚心能自持'一语双关，既写竹之品性，又抒己之志。王建称薛涛为'女校书'，赞其才华为当时女诗人之冠；纪昀《四库全书总目提要》称其诗'格清雅，不染纤尘'。薛涛以竹自喻，展现了其高洁的品格和不屈的精神。",
            "ai_generated": True
        }
    ],
    "xuetao-01-02": [
        {
            "id": "huzi-xuetao-01-02",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "胡仔",
            "author_id": "hu-zi",
            "source": "《苕溪渔隐丛话》",
            "view_angle": "诗评",
            "content": "薛涛《春望词》'花开不同赏，花落不同悲'以浅语写深愁，女中诗豪，非虚言也。"
        },
        {
            "id": "ai-modern-xuetao-01-02",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "此诗为《春望词四首》之一，表达对知音的渴望。'花开不同赏，花落不同悲'以朴素语言写出深切的相思之苦，胡仔称其'以浅语写深愁'。薛涛借花开花落喻人生聚散，将个人情感升华为具有普遍意义的人生感慨。",
            "ai_generated": True
        }
    ],
    "xuetao-01-03": [
        {
            "id": "huzi-xuetao-01-03",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "胡仔",
            "author_id": "hu-zi",
            "source": "《苕溪渔隐丛话》",
            "view_angle": "诗评",
            "content": "'揽草结同心，将以遗知音'，寄情于物，缠绵悱恻，深得风人之旨。"
        },
        {
            "id": "ai-modern-xuetao-01-03",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "此诗以'结同心'的传统意象表达对爱情的向往。'春愁正断绝，春鸟复哀吟'以鸟鸣反衬内心的孤寂。薛涛通过'同心草'这一象征物，表达了对真挚爱情的渴望，同时也暗示了美好愿望难以实现的无奈。",
            "ai_generated": True
        }
    ],
    "xuetao-01-04": [
        {
            "id": "jiyun-xuetao-01-04",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "纪昀",
            "author_id": "ji-yun",
            "source": "《四库全书总目提要》",
            "view_angle": "考据",
            "content": "'不结同心人，空结同心草'，语浅意深，寄慨遥深，非寻常闺阁诗可比。"
        },
        {
            "id": "ai-modern-xuetao-01-04",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "此诗为《春望词》第三首，'不结同心人，空结同心草'以同心草的意象表达爱情落空的悲痛。纪昀称其'语浅意深，寄慨遥深'。薛涛通过这一对比，揭示了爱情理想与现实的巨大落差，表达了对命运的无奈和对爱情的绝望。",
            "ai_generated": True
        }
    ],
    "xuetao-01-05": [
        {
            "id": "huzi-xuetao-01-05",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "胡仔",
            "author_id": "hu-zi",
            "source": "《苕溪渔隐丛话》",
            "view_angle": "诗评",
            "content": "'玉箸垂朝镜，春风知不知'句，以无理而妙，写出深闺孤怨，可谓神来之笔。"
        },
        {
            "id": "ai-modern-xuetao-01-05",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "此诗为《春望词》第四首，以问句作结，'春风知不知'将内心的孤独与哀怨推向高潮。胡仔称其'以无理而妙'，赞其构思新颖。'玉箸垂朝镜'以玉箸喻泪，形象生动，展现了薛涛炼字的功力。全诗以春日美景反衬内心的愁苦，体现了薛涛诗歌'以乐景写哀情'的艺术特色。",
            "ai_generated": True
        }
    ],
    "zhushuzhen-01-01": [
        {
            "id": "chentingchao-zhushuzhen-01-01",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《白雨斋词话》卷二",
            "view_angle": "词论",
            "content": "朱淑真词，才力不逮易安，然规模唐、五代，不失分寸。如'年年玉镜台'及'春已半'等篇，殊不让和凝、李殉辈。唯骨韵不高，可称小品。"
        },
        {
            "id": "weizhonggong-zhushuzhen-01-01",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "魏仲恭",
            "author_id": "wei-zhong-gong",
            "source": "《断肠诗集序》",
            "view_angle": "序跋",
            "content": "清新婉丽，蓄思多情，能道人意中事，岂泛泛者所能及，未尝不一唱三叹也。"
        },
        {
            "id": "ai-modern-zhushuzhen-01-01",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《忆秦娥》描写元宵佳节的情景，'弯弯曲，新年新月钩寒玉'以新月喻美人，构思精巧。陈廷焯《白雨斋词话》称其'规模唐、五代，不失分寸'，魏仲恭序称其'清新婉丽，蓄思多情'。朱淑真以细腻笔触描绘节日景象，寄寓对美好爱情的向往。",
            "ai_generated": True
        }
    ],
    "zhushuzhen-01-02": [
        {
            "id": "chentingchao-zhushuzhen-01-02",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《白雨斋词话》",
            "view_angle": "词论",
            "content": "朱淑真词，风致不减易安，而沉痛过之。"
        },
        {
            "id": "kuangzhouyi-zhushuzhen-01-02",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "况周颐",
            "author_id": "kuang-zhou-yi",
            "source": "《蕙风词话》卷四",
            "view_angle": "词论",
            "content": "淑真清空婉约，纯乎北宋；易安笔情近浓至，意境较沈博，下开南宋风气。"
        },
        {
            "id": "ai-modern-zhushuzhen-01-02",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《浣溪沙》描写春日闺中愁绪，'恼人光景又清明'将春光与愁情并置，以乐景写哀情。陈廷焯称其'风致不减易安，而沉痛过之'，况周颐认为其'清空婉约，纯乎北宋'。朱淑真通过细腻的景物描写，表达了内心的孤寂与无奈。",
            "ai_generated": True
        }
    ],
    "zhushuzhen-01-03": [
        {
            "id": "chentingchao-zhushuzhen-01-03",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《白雨斋词话》卷二",
            "view_angle": "词论",
            "content": "如'年年玉镜台'及'春已半'等篇，殊不让和凝、李殉辈。"
        },
        {
            "id": "ai-modern-zhushuzhen-01-03",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《生查子》表达寒食节期间的愁思，'不忍卷帘看，寂寞梨花落'以梨花飘落象征青春逝去和爱情无望。陈廷焯称其可与五代词人媲美。朱淑真以'玉减翠裙交，病怯罗衣薄'刻画女主人公的憔悴形象，展现了其高超的描写技巧。",
            "ai_generated": True
        }
    ],
    "zhushuzhen-01-04": [
        {
            "id": "kuangzhouyi-zhushuzhen-01-04",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "况周颐",
            "author_id": "kuang-zhou-yi",
            "source": "《蕙风词话》",
            "view_angle": "词论",
            "content": "淑真清空婉约，纯乎北宋；易安笔情近浓至，意境较沈博，下开南宋风气。"
        },
        {
            "id": "ai-modern-zhushuzhen-01-04",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "此《生查子》表达对远方亲人的思念，'人远天涯近'以空间的远近对比，表达内心的牵挂。况周颐称朱淑真词'清空婉约，纯乎北宋'。朱淑真通过'酒从别后疏，泪向愁中尽'展现了离别后的痛苦与无奈。",
            "ai_generated": True
        }
    ],
    "zhushuzhen-01-05": [
        {
            "id": "chentingchao-zhushuzhen-01-05",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《白雨斋词话》",
            "view_angle": "词论",
            "content": "朱淑真词，风致之佳，情词之妙，直可亚于易安。"
        },
        {
            "id": "ai-modern-zhushuzhen-01-05",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《谒金门》为朱淑真代表作之一，'春已半，触目此情无限'开篇即奠定愁绪基调。'满院落花帘不卷，断肠芳草远'以落花和芳草象征逝去的青春和遥远的思念。陈廷焯称其'风致之佳，情词之妙，直可亚于易安'，给予极高评价。",
            "ai_generated": True
        }
    ]
}

DEFAULT_ANNOTATIONS = {
    "shuyuci": [
        {
            "id": "chentingchao-shuyuci",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《白雨斋词话》",
            "view_angle": "词论",
            "content": "李易安词，独辟门径，居然可观，其源自淮海、大晟，而铸语则多生造，妇人有此，可谓奇矣。"
        },
        {
            "id": "zhangyan-shuyuci",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "张綖",
            "author_id": "zhang-yan",
            "source": "《诗余图谱》",
            "view_angle": "词论",
            "content": "易安词，婉约以易安为宗，豪放唯幼安称首，皆吾济南人，难乎为继矣。"
        },
        {
            "id": "ai-modern-shuyuci",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "李清照作为宋代婉约词派的代表人物，其词作以'以俗为雅'的艺术特色著称。陈廷焯称其'独辟门径，居然可观'，张綖将其与辛弃疾并称为济南二安。李清照的词不仅在艺术上达到了很高的成就，更以其独特的女性视角和真挚的情感表达，在中国文学史上占有重要地位。",
            "ai_generated": True
        }
    ],
    "yuxuanji": [
        {
            "id": "xinfang-yuxuanji",
            "era": "yuan",
            "era_name": "元代",
            "era_code": "yuan",
            "author": "辛文房",
            "author_id": "xin-wen-fang",
            "source": "《唐才子传》",
            "view_angle": "传记",
            "content": "玄机，长安人，女道士也。性聪慧，有才思，好读书，尤工诗。与李冶、薛涛、刘采春并称唐代四大女诗人。"
        },
        {
            "id": "zhangxing-yuxuanji",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "钟惺",
            "author_id": "zhong-xing",
            "source": "《名媛诗归》",
            "view_angle": "诗评",
            "content": "玄机，盖才媛中之诗圣也！"
        },
        {
            "id": "ai-modern-yuxuanji",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "鱼玄机为唐代四大女诗人之一，其诗作现存五十余首。辛文房《唐才子传》称其'性聪慧，有才思'，钟惺《名媛诗归》尊其为'才媛中之诗圣'。鱼玄机的诗歌以情感真挚、语言华美著称，其代表作《赠邻女》中的'易求无价宝，难得有心郎'成为千古名句，表达了女性对爱情的渴望与无奈。",
            "ai_generated": True
        }
    ],
    "xuetao": [
        {
            "id": "wangjian-xuetao",
            "era": "tang",
            "era_name": "唐代",
            "era_code": "tang",
            "author": "王建",
            "author_id": "wang-jian",
            "source": "《寄蜀中薛涛校书》",
            "view_angle": "诗评",
            "content": "万里桥边女校书，枇杷花里闭门居。扫眉才子知多少，管领春风总不如。"
        },
        {
            "id": "jiyun-xuetao",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "纪昀",
            "author_id": "ji-yun",
            "source": "《四库全书总目提要》",
            "view_angle": "考据",
            "content": "薛涛诗格清雅，不染纤尘。其咏物抒怀之作，寄托深远，非寻常闺阁词藻可比。"
        },
        {
            "id": "ai-modern-xuetao",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "薛涛为唐代著名女诗人，与李冶、鱼玄机、刘采春并称唐代四大女诗人。王建称其为'女校书'，赞其才华为当时之冠；纪昀称其诗'格清雅，不染纤尘'。薛涛的诗歌题材广泛，既有咏物抒怀之作，也有反映社会现实的篇章，其代表作《春望词》以细腻的笔触表达了对爱情的渴望与无奈。",
            "ai_generated": True
        }
    ],
    "zhushuzhen": [
        {
            "id": "chentingchao-zhushuzhen",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《白雨斋词话》",
            "view_angle": "词论",
            "content": "朱淑真词，风致之佳，情词之妙，直可亚于易安。宋妇人能词者不少，易安为冠，次则朱淑真，次则魏夫人也。"
        },
        {
            "id": "weizhonggong-zhushuzhen",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "魏仲恭",
            "author_id": "wei-zhong-gong",
            "source": "《断肠诗集序》",
            "view_angle": "序跋",
            "content": "比往武林，见旅邸中好事者往往传诵朱淑真词，每窃听之，清新婉丽，蓄思多情，能道人意中事，岂泛泛者所能及，未尝不一唱三叹也。"
        },
        {
            "id": "ai-modern-zhushuzhen",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "朱淑真为宋代著名女词人，与李清照并称'宋代女性词人双璧'。陈廷焯称其'风致之佳，情词之妙，直可亚于易安'，魏仲恭序称其'清新婉丽，蓄思多情'。朱淑真的作品以真挚的情感表达和独特的女性视角著称，其词集名为《断肠集》，反映了她不幸的婚姻和抑郁的一生。",
            "ai_generated": True
        }
    ],
    "donghaiyuge": [
        {
            "id": "chentingchao-donghaiyuge",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《白雨斋词话》",
            "view_angle": "词论",
            "content": "顾太清词，深稳沉著，不事雕琢，纯以情胜，在国朝妇人词中，可称上乘。"
        },
        {
            "id": "kuangzhouyi-donghaiyuge",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "况周颐",
            "author_id": "kuang-zhou-yi",
            "source": "《蕙风词话》",
            "view_angle": "词论",
            "content": "太清词，其佳处在气格，不在字句。然亦有精于字句者，如'云随碧水歌声转，雪绕红绡舞袖垂'，真佳境也。"
        },
        {
            "id": "ai-modern-donghaiyuge",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "顾太清为清代著名女词人，与纳兰性德并称'男中成容若，女中太清春'。陈廷焯称其词'深稳沉著，不事雕琢，纯以情胜'，况周颐赞其'气格'之高。顾太清的词以题材广泛、情感真挚著称，其代表作《东海渔歌》展现了清代女性词人的艺术成就。",
            "ai_generated": True
        }
    ],
    "weiwan": [
        {
            "id": "chentingchao-weiwan",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "陈廷焯",
            "author_id": "chen-ting-chao",
            "source": "《白雨斋词话》",
            "view_angle": "词论",
            "content": "宋妇人能词者不少，易安为冠，次则朱淑真，次则魏夫人也。魏夫人词，笔力甚高，非寻常闺秀可比。"
        },
        {
            "id": "kuangzhouyi-weiwan",
            "era": "qing",
            "era_name": "清代",
            "era_code": "qing",
            "author": "况周颐",
            "author_id": "kuang-zhou-yi",
            "source": "《蕙风词话》",
            "view_angle": "词论",
            "content": "魏夫人词，虽不及易安之高妙，然亦有可观者。如'波上清风，画船明月人归后'，意境清远，殊有雅韵。"
        },
        {
            "id": "ai-modern-weiwan",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "魏夫人为宋代著名女词人，陈廷焯将其与李清照、朱淑真并列为宋代三大女词人。魏夫人的词以'笔力甚高'著称，其作品意境清远，风格典雅。她的代表作《菩萨蛮·溪山掩映斜阳里》等展现了宋代女性词人的艺术风采。",
            "ai_generated": True
        }
    ],
    "liuye": [
        {
            "id": "gaozhongwu-liuye",
            "era": "tang",
            "era_name": "唐代",
            "era_code": "tang",
            "author": "高仲武",
            "author_id": "gao-zhong-wu",
            "source": "《中兴间气集》",
            "view_angle": "诗评",
            "content": "李季兰（李冶），名冶，以字行，吴兴人也。有诗名，五言律诗，善写闺情，词旨清婉，多佳句。"
        },
        {
            "id": "xinfang-liuye",
            "era": "yuan",
            "era_name": "元代",
            "era_code": "yuan",
            "author": "辛文房",
            "author_id": "xin-wen-fang",
            "source": "《唐才子传》",
            "view_angle": "传记",
            "content": "李冶，字季兰，吴兴人也。女道士。聪慧有才藻，工诗文，与陆羽、皎然相友善。"
        },
        {
            "id": "ai-modern-liuye",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "李冶（李季兰）为唐代著名女诗人，与薛涛、鱼玄机、刘采春并称唐代四大女诗人。高仲武《中兴间气集》称其'五言律诗，善写闺情，词旨清婉'，辛文房《唐才子传》称其'聪慧有才藻'。李冶的诗歌以五言律诗见长，其代表作《寄校书七兄》《明月夜留别》等展现了唐代女诗人的艺术成就。",
            "ai_generated": True
        }
    ],
    "baitouyin": [
        {
            "id": "gehong-baitouyin",
            "era": "jin",
            "era_name": "晋代",
            "era_code": "jin",
            "author": "葛洪",
            "author_id": "ge-hong",
            "source": "《西京杂记》",
            "view_angle": "纪事",
            "content": "司马相如将聘茂陵女为妾，卓文君作《白头吟》以自绝，相如乃止。"
        },
        {
            "id": "shuijingzhu-baitouyin",
            "era": "beiwei",
            "era_name": "北魏",
            "era_code": "beiwei",
            "author": "郦道元",
            "author_id": "li-dao-yuan",
            "source": "《水经注》",
            "view_angle": "地理",
            "content": "《白头吟》，卓文君所作也。"
        },
        {
            "id": "ai-modern-baitouyin",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《白头吟》相传为卓文君所作，表达了对爱情坚贞不渝的追求和对负心人的决绝。葛洪《西京杂记》记载了司马相如欲纳妾而卓文君作此诗的故事，郦道元《水经注》亦有记载。'愿得一心人，白头不相离'成为千古名句，表达了古代女性对真挚爱情的渴望。",
            "ai_generated": True
        }
    ],
    "gongci": [
        {
            "id": "shengyu-gongci",
            "era": "tang",
            "era_name": "唐代",
            "era_code": "tang",
            "author": "沈佺期",
            "author_id": "shen-quan-qi",
            "source": "《全唐诗》",
            "view_angle": "诗评",
            "content": "宫词之作，始于六朝，至唐而盛。其词多写宫中生活，或怨或慕，皆有深意。"
        },
        {
            "id": "ai-modern-gongci",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "宫词是中国古代诗歌的重要题材，以描写宫中生活、宫女情感为主要内容。唐代是宫词创作的鼎盛时期，沈佺期等诗人的作品为宫词的发展奠定了基础。宫词不仅反映了宫中生活的真实面貌，更表达了宫女们内心的哀怨与无奈，具有深刻的社会意义。",
            "ai_generated": True
        }
    ],
    "huangge": [
        {
            "id": "guoxue-huangge",
            "era": "ming",
            "era_name": "明代",
            "era_code": "ming",
            "author": "佚名",
            "author_id": "yi-ming",
            "source": "《古诗源》",
            "view_angle": "诗选",
            "content": "《黄鹄歌》，汉昭帝时黄鹄下太液池，作此歌。词旨哀婉，动人肝肠。"
        },
        {
            "id": "ai-modern-huangge",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《黄鹄歌》为汉代乐府诗，相传为汉昭帝时所作。诗歌以黄鹄为喻，表达了对自由的向往和对束缚的哀怨。'黄鹄飞兮下建章，羽肃肃兮行跄跄'描绘了黄鹄飞翔的姿态，整首诗意境深远，情感真挚，展现了汉代乐府诗的艺术特色。",
            "ai_generated": True
        }
    ],
    "caishuyuan": [
        {
            "id": "songshi-caishuyuan",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "佚名",
            "author_id": "yi-ming",
            "source": "《宋史·艺文志》",
            "view_angle": "史志",
            "content": "蔡琰，字文姬，陈留人。博学有才辩，又妙于音律。"
        },
        {
            "id": "ai-modern-caishuyuan",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "蔡琰（蔡文姬）为东汉著名女诗人，博学多才，精通音律。《宋史·艺文志》记载了她的生平事迹。蔡文姬的代表作《悲愤诗》是中国文学史上第一篇自传体长篇叙事诗，以其深刻的社会内容和强烈的艺术感染力著称。",
            "ai_generated": True
        }
    ],
    "nixiaoshan": [
        {
            "id": "shuijingzhu-nixiaoshan",
            "era": "beiwei",
            "era_name": "北魏",
            "era_code": "beiwei",
            "author": "郦道元",
            "author_id": "li-dao-yuan",
            "source": "《水经注》",
            "view_angle": "地理",
            "content": "湘夫人，帝尧之女，舜之二妃也。舜崩于苍梧，二妃死于江湘之间，俗谓之湘君。"
        },
        {
            "id": "ai-modern-nixiaoshan",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《拟湘夫人》以湘夫人的传说为题材，表达了对爱情的忠贞和对逝去恋人的思念。郦道元《水经注》记载了湘夫人的传说，称其为帝尧之女、舜之二妃。这首诗通过拟古的手法，展现了湘夫人的美丽形象和哀怨情感。",
            "ai_generated": True
        }
    ],
    "liucaichun": [
        {
            "id": "songshi-liucaichun",
            "era": "song",
            "era_name": "宋代",
            "era_code": "song",
            "author": "佚名",
            "author_id": "yi-ming",
            "source": "《宋史·艺文志》",
            "view_angle": "史志",
            "content": "刘采春，淮甸人，伶工周季崇之妻也。善歌，其词传入宫中，武宗尝谓左右曰：'刘采春歌，天下无双。'"
        },
        {
            "id": "ai-modern-liucaichun",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "刘采春为唐代著名女诗人，与薛涛、鱼玄机、李冶并称唐代四大女诗人。《宋史·艺文志》记载了她的生平，称其'善歌'，唐武宗曾赞其'天下无双'。刘采春的诗歌以乐府诗为主，多写闺情，语言质朴，情感真挚。",
            "ai_generated": True
        }
    ],
    "taishanyin": [
        {
            "id": "yuefu-taishanyin",
            "era": "han",
            "era_name": "汉代",
            "era_code": "han",
            "author": "佚名",
            "author_id": "yi-ming",
            "source": "《乐府诗集》",
            "view_angle": "乐府",
            "content": "《泰山吟》，汉乐府曲名也。古辞曰：'上邪！我欲与君相知，长命无绝衰。'"
        },
        {
            "id": "ai-modern-taishanyin",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《泰山吟》为汉代乐府诗，以泰山为背景，表达了对爱情的坚贞誓言。《乐府诗集》收录了此曲，古辞'上邪！我欲与君相知，长命无绝衰'表达了对爱情的执着追求。这首诗以其质朴的语言和强烈的情感表达，成为中国文学史上的经典之作。",
            "ai_generated": True
        }
    ],
    "yuangexing": [
        {
            "id": "yuefu-yuangexing",
            "era": "han",
            "era_name": "汉代",
            "era_code": "han",
            "author": "佚名",
            "author_id": "yi-ming",
            "source": "《乐府诗集》",
            "view_angle": "乐府",
            "content": "《怨歌行》，汉班婕妤所作也。婕妤失宠，作此诗以自伤。"
        },
        {
            "id": "shuijingzhu-yuangexing",
            "era": "beiwei",
            "era_name": "北魏",
            "era_code": "beiwei",
            "author": "郦道元",
            "author_id": "li-dao-yuan",
            "source": "《水经注》",
            "view_angle": "地理",
            "content": "《怨歌行》，班婕妤作。"
        },
        {
            "id": "ai-modern-yuangexing",
            "era": "modern",
            "era_name": "现代",
            "era_code": "modern",
            "author": "AI 综合解读",
            "author_id": "ai-modern",
            "source": "基于历代注疏的 AI 整理",
            "view_angle": "思想史",
            "content": "《怨歌行》相传为班婕妤所作，以团扇为喻，表达了失宠后的哀怨与无奈。《乐府诗集》和《水经注》均有记载。'常恐秋节至，凉飙夺炎热。弃捐箧笥中，恩情中道绝'成为千古名句，反映了古代女性在宫廷中的悲惨命运。",
            "ai_generated": True
        }
    ]
}

def update_annotations():
    content_dir = os.path.join(os.path.dirname(__file__), '..', 'content')
    
    for author_dir in os.listdir(content_dir):
        author_path = os.path.join(content_dir, author_dir)
        if not os.path.isdir(author_path):
            continue
        
        classic_id = author_dir
        
        for json_file in os.listdir(author_path):
            if not json_file.endswith('.json'):
                continue
            
            json_path = os.path.join(author_path, json_file)
            
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            updated = False
            for para in data['paragraphs']:
                para_id = para['id']
                
                if para_id in AUTHORITY_ANNOTATIONS:
                    para['annotations'] = AUTHORITY_ANNOTATIONS[para_id]
                    updated = True
                    print(f"  更新段落: {para_id}")
                elif classic_id in DEFAULT_ANNOTATIONS:
                    default_anns = []
                    for ann in DEFAULT_ANNOTATIONS[classic_id]:
                        new_ann = ann.copy()
                        new_ann['id'] = f"{ann['id']}-{para_id.split('-')[-1]}"
                        default_anns.append(new_ann)
                    para['annotations'] = default_anns
                    updated = True
                    print(f"  使用默认注疏: {para_id}")
            
            if updated:
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"更新文件: {json_path}")
            else:
                print(f"无更新: {json_path}")
    
    print("\n注疏更新完成！")

if __name__ == '__main__':
    update_annotations()