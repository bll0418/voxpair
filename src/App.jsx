import React, {useState, useEffect, useRef} from 'react';
import { Routes, Route, useParams } from 'react-router-dom';

const theirAvatar = '/assets/avatar/2.jpg';

// 1. 定义头像列表
const AVATAR_LIST = [
    '/assets/avatar/1.jpg',
    '/assets/avatar/2.jpg',
    '/assets/avatar/3.jpg',
    '/assets/avatar/4.jpg',
    '/assets/avatar/5.jpg',
    '/assets/avatar/6.jpg',
    '/assets/avatar/7.jpg',
    '/assets/avatar/8.jpg',
    '/assets/avatar/9.jpg',
    '/assets/avatar/10.jpg',
    '/assets/avatar/11.jpg',
    '/assets/avatar/12.jpg',
    '/assets/avatar/13.jpg',
    '/assets/avatar/14.jpg',
    '/assets/avatar/15.jpg',
    '/assets/avatar/16.jpg',
    '/assets/avatar/17.jpg',
    '/assets/avatar/18.jpg',
    '/assets/avatar/19.jpg',
    '/assets/avatar/20.jpg',
    '/assets/avatar/21.jpg',
    '/assets/avatar/22.jpg',
    '/assets/avatar/23.jpg',
    '/assets/avatar/24.jpg'
];

const languages = {
    zh: '中文',
    en: 'English',
    fr: 'Français',
    de: 'Deutsch',
    ja: '日本語',
};
const originalMessageTip = {
    zh: '原文',
    en: 'original',
    fr: 'original',
    de: 'Deutsch',
    ja: '原文',
};

const inputMessagePlaceholder = {
    zh: '输入消息...',
    en: 'Input message..',
    fr: 'Saisissez votre message...',
    de: 'Geben Sie Ihre Nachricht ein...',
    ja: 'メッセージを入力してください...',
};

//用户id:4位字母 + 3位数字
const generateUsername = () => {
    const s = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const n = "0123456789";
    const r = (src, len) => Array.from({length: len}, () => src[Math.floor(Math.random() * src.length)]).join('');
    return r(s, 4) + r(n, 3);
};

//获取我的id,先从sessionStorage中获取
const getMyPeerId = () => {
    let myPeerId = sessionStorage.getItem('myPeerId');
   //console.log('从sessionStorage获取的myPeerId:', myPeerId);
    if (!myPeerId) {
        myPeerId = generateUsername();
        sessionStorage.setItem('myPeerId', myPeerId);
        console.log('生成新的myPeerId:', myPeerId);
    }
    return myPeerId;
};

//获取聊天记录缓存key
const getHistoryKey = (roomId) => {
    if (!roomId) return null;
    return `chat_history_${roomId}`;
};

const translate = async (text, sourceLang, targetLang) => {
    console.log('正在尝试翻译:' + text + ',源语言:' + sourceLang + ',目标语言:' + targetLang);
    if (sourceLang === targetLang || !text.trim()) return text;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data.responseData.translatedText || text;
    } catch (e) {
        console.error("翻译失败：" + e);
        return text + ' (翻译失败)';
    }
};


// const translate = async (text, sourceLang, targetLang) => {
//     console.log('正在尝试翻译:' + text + ',源语言:' + sourceLang + ',目标语言:' + targetLang);
//     if (sourceLang === targetLang || !text.trim()) return text;
//     const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
//     try {
//         const res = await fetch(url);
//         const data = await res.json();
//         return data[0].map(segment => segment[0]).join('');
//     } catch (e) {
//         console.error("翻译失败：" + e);
//         return text + ' (翻译失败)';
//     }
// };

export function App() {
    return (
        <Routes>
            <Route path="/:urlRoomId" element={<ChatRoom />} />
            <Route path="/" element={<ChatRoom />} />
        </Routes>
    );
}


function ChatRoom() {
    const {urlRoomId} = useParams();
    // 2. 初始化我的头像状态 (从缓存读取或默认选第一个)
    const [myAvatar, setMyAvatar] = useState(() => {
        const savedIndex = sessionStorage.getItem('myAvatar');
        // 如果缓存中存在头像编号且有效，则使用对应头像，否则使用默认头像
        if (savedIndex && !isNaN(parseInt(savedIndex)) && AVATAR_LIST[parseInt(savedIndex)]) {
            return AVATAR_LIST[parseInt(savedIndex)];
        }
        return AVATAR_LIST[0];
    });
    const [showAvatarPicker, setShowAvatarPicker] = useState(false); // 控制弹窗显隐

    const [myLang, setMyLang] = useState('zh');

    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [connected, setConnected] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    // 在 ChatRoom 组件内
    const wsRef = useRef(null);

    const messagesEndRef = useRef(null);

    //我的id从缓存获取或自动生成
    const myPeerId = getMyPeerId();
    const myPeerIdRef = useRef(myPeerId);
    const myLangRef = useRef(myLang);
    //对方的id从url中获取
    const theirPeerIdRef = useRef(urlRoomId);
    const theirLangRef = useRef('en');

    //房间号默认到url中获取
    const roomId = useRef(urlRoomId);

    // 3. 更换头像的处理函数
    const changeAvatar = (newAvatar) => {
        // 将头像编号存储到缓存，而不是完整路径
        const avatarIndex = AVATAR_LIST.indexOf(newAvatar);
        if (avatarIndex !== -1) {
            sessionStorage.setItem('myAvatar', avatarIndex.toString());
            setShowAvatarPicker(false);
            setMyAvatar(newAvatar);
        }
    };


    //加载历史记录
    const loadHistory = () => {
        console.log('开始加载历史记录');
        const key = getHistoryKey(roomId.current);
        if (key) {
            const saved = sessionStorage.getItem(key);
            if (saved) {
                setConnected(true) ;
                const parsed = JSON.parse(saved);
                console.log(`加载历史记录 [${key}]:`, parsed.length, "条");
                setMessages(parsed);
            } else {
                setMessages([]);
            }
        }
    };


    const copyId = async () => {
        if (!myPeerIdRef.current)    return;
        try {
            await navigator.clipboard.writeText(`${import.meta.env.VITE_APP_BASE_URL}/${myPeerIdRef.current}`);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (e) {
            console.error('复制失败',e);
        }
    };

    const changeMyLang = async (newLang) => {
        myLangRef.current = newLang
        setMyLang(newLang);

        console.log('change我的语言：' + newLang);
        sessionStorage.setItem('myLang', newLang);
    };


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages,myLang,urlRoomId]);


    useEffect(() => {
        //如果url中没有房间号，就取分享人的peerId即为roomId
        console.log('我的id：' + myPeerIdRef.current + ',urlRoomId:' + urlRoomId);
        if(!urlRoomId){
            roomId.current = myPeerIdRef.current;
        }

        // 2. 建立 WebSocket 连接
        const ws = new WebSocket(`wss://chatbackend.asktraceai.com?roomId=${roomId.current}`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket 连接成功,当前的房间号:' + roomId.current);
            let myLanguage = sessionStorage.getItem('myLang');
            if (myLanguage) {
                console.log('从缓存中获取我的语言：' + myLanguage);
                setMyLang(myLanguage);
                myLangRef.current = myLanguage;
            }
            loadHistory();
            // 连接成功后可以发送一个init消息，向房间里的所有人,告之自己的语言
            ws.send(JSON.stringify({ type: 'init', id: myPeerIdRef.current,lang: myLangRef.current }));
        };

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'init') {
                console.log('监听init数据,加载历史记录，保存对方的id:', data.id + ',对方语言:' + data.lang);
                theirPeerIdRef.current = data.id;
                theirLangRef.current = data.lang;
                loadHistory();
                setConnected(true);

            } else if (data.type === 'msg') {
                console.log('监听msg数据:'+ data.text +',对方的id:'+ data.from +',对方的语言:', data.lang + ',我的语言:' + myLangRef.current);
                const translated = await translate(data.text, data.lang, myLangRef.current);
                const newMessage = { text: translated, original: data.text, from: data.from, isMine: false, time: data.time,avatar: data.avatar };
                setMessages(prev => {
                    const updated = [...prev, newMessage];
                    const key = getHistoryKey(roomId.current);
                    if (key) sessionStorage.setItem(key, JSON.stringify(updated));
                    return updated;
                });
            }
        };

        ws.onclose = () => {
            setConnected(false);
            console.log('WebSocket 已断开');
        };

        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, [urlRoomId]);


    const send = () => {
        if (message.trim() && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('发送信息:' + message + ',roomId:' + roomId.current + ',我的语言:' + myLangRef.current);
            const time = new Date().toLocaleTimeString('zh-CN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            const msgData = {
                type: 'msg',
                from: myPeerIdRef.current,
                text: message,
                time: time,
                lang: myLangRef.current,
                avatar:AVATAR_LIST.indexOf(myAvatar)
            };

            // 发送给服务器，服务器会转发给对方
            wsRef.current.send(JSON.stringify(msgData));


            const mySendMessage = {text: message, isMine: true,time:  time };

            setMessages(prev => {
                const updated = [...prev, mySendMessage];
                const key = getHistoryKey(roomId.current);
                if (key) sessionStorage.setItem(key, JSON.stringify(updated));
                // 清空输入框
                setMessage("");
                return updated;
            });

        }
    };


    return (<div className="min-h-screen bg-gray-100 flex flex-col">
        {/* 4. 头像选择弹窗 (Portal 效果) */}
        {showAvatarPicker && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setShowAvatarPicker(false)}>
                <div className="bg-white p-6 rounded-2xl shadow-xl max-w-xs w-full" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold mb-4 text-center">选择新头像</h3>
                    <div className="grid grid-cols-3 gap-4">
                        {AVATAR_LIST.map((src, idx) => (
                            <img
                                key={idx}
                                src={src}
                                alt="avatar-option"
                                className={`w-16 h-16 rounded-lg cursor-pointer border-4 transition-all ${myAvatar === src ? 'border-green-500 scale-110' : 'border-transparent hover:border-gray-200'}`}
                                onClick={() => changeAvatar(src)}
                            />
                        ))}
                    </div>
                    <button
                        className="w-full mt-6 py-2 bg-gray-100 rounded-lg font-medium"
                        onClick={() => setShowAvatarPicker(false)}
                    >
                        取消
                    </button>
                </div>
            </div>
        )}
        {!connected && !urlRoomId ? (<div className="max-w-lg mx-auto mt-20 p-8 bg-white rounded-2xl shadow-2xl">
            <h1 className="text-2xl font-bold text-center mb-8">TransChat-跨语言沟通</h1>
            <p className="text-center mb-6 text-lg">
                <strong className="text-green-600 text-4xl font-bold text-center mb-8">{myPeerId || '加载中...'}</strong><br/>
            </p>
            <div className="text-sm text-gray-600 mr-3 mb-5 text-center">
                 分享链接给对方即可聊天
            </div>

            <div className="mt-2 flex items-center justify-center mb-5">
                <input
                    type="text"
                    value={import.meta.env.VITE_APP_BASE_URL.replace('https://', '') + '/' + myPeerId}
                    readOnly
                    className="border border-gray-300 rounded px-3 py-1 text-sm bg-gray-50"
                />


                <button onClick={copyId}  className="ml-2 bg-blue-500 text-white pl-1 pr-3 py-1 rounded text-sm flex items-center" >
                    {!isCopied && (
                        <>
                            <svg className="w-7 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h10a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>复制</span>
                        </>
                    )}
                    {isCopied && (
                        <>
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>已复制</span>
                        </>
                    )}
                </button>
            </div>

            <div className="mb-8 mt-10">
                <label className="block text-lg font-medium mb-3">我的语言</label>
                <select
                    className="w-full border-2 border-gray-300 rounded-xl px-5 py-4 text-lg bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none"
                    value={myLang}
                    onChange={e => changeMyLang(e.target.value)}
                >
                    {Object.entries(languages).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                    ))}
                </select>
            </div>

        </div>) : (<div className="max-w-2xl w-full mx-auto flex flex-col h-screen bg-gray-100">

            <div className="bg-gray-50 px-4 py-3 text-center  border-b border-gray-200  flex items-center justify-between shadow-sm">
                <h2 className="text-xl font-bold text-black pl-1.5"># {roomId.current}</h2>
                <div className="relative">
                    <select
                        value={myLang}
                        onChange={(e) => changeMyLang(e.target.value)}
                        className="appearance-none bg-transparent border-2 border-gray-100 rounded-lg px-4 py-2 pr-10 text-lg font-medium focus:outline-none focus:border-gray-200 cursor-pointer">
                        {Object.entries(languages).map(([code, name]) => (
                            <option key={code} value={code}>{name}</option>
                        ))}
                    </select>

                    {/* 下拉箭头图标 */}
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
            </div>



            <div className="flex-1 overflow-y-auto px-4 py-6 bg-[#f5f5f5]">
                {messages.map((msg, i) => {
                    // const showTime = i === 0 || messages[i-1].time !== msg.time;
                    // const showTime = i === 0 || (msg.time && messages[i - 1]?.time !== msg.time);
                    // --- 逻辑处理：判断是否显示时间条 ---
                    // 如果是第一条消息，或者当前消息的时间(分)与上一条不同，则显示居中时间
                    const currentTime = msg.time?.split(':').slice(0, 2).join(':');
                    const prevTime = i > 0 ? messages[i - 1].time?.split(':').slice(0, 2).join(':') : null;
                    const showTime = i === 0 || currentTime !== prevTime;
                    return (<React.Fragment key={i}>
                        {/* 1. 时间显示条 */}
                        {showTime && (
                            <div className="flex justify-center my-1">
                                    <span className="text-[12px] text-gray-400 bg-transparent px-2 py-1">
                                       {msg.time}
                                    </span>
                            </div>
                        )}
                    <div key={i} className={`flex mb-3 ${msg.isMine ? 'justify-end' : 'justify-start'}`}>


                        {!msg.isMine && (
                            <div className="flex items-start max-w-[85%]">
                                {/*<img src={theirAvatar} alt="对方" className="w-10 h-10 rounded-md mr-3 mt-5 object-cover" />*/}
                                <img src={AVATAR_LIST[parseInt(msg.avatar)]} alt="对方" className="w-10 h-10 rounded-md mr-3 mt-5 object-cover" />
                                <div className="flex flex-col">
                                    {/* PeerID 放在消息上方，颜色淡化 */}
                                    <span className="text-[11px] text-gray-400 mb-1 ml-0.5">{msg.from}</span>

                                    {/* 气泡容器 */}
                                    <div className="relative bg-white text-black px-3 py-2.5 rounded-md shadow-sm border border-[#e5e5e5]">
                                        {/* 尖角：通过绝对定位放在顶部下方一点点 */}
                                        <div className="absolute top-[14px] -left-[6px] w-0 h-0
                                border-t-[6px] border-t-transparent
                                border-r-[6px] border-r-white
                                border-b-[6px] border-b-transparent">
                                        </div>
                                        {/* 尖角边框（可选，为了配合 border 效果） */}
                                        <div className="absolute top-[14px] -left-[7px] w-0 h-0 -z-10
                                border-t-[6px] border-t-transparent
                                border-r-[6px] border-r-[#e5e5e5]
                                border-b-[6px] border-b-transparent">
                                        </div>

                                        {msg.original && (
                                            <p className="text-[11px] text-gray-400 mb-1 pb-1 border-b border-gray-50">
                                                {originalMessageTip[myLang]}: {msg.original}
                                            </p>
                                        )}
                                        <p className="text-[15px] break-words whitespace-pre-wrap leading-snug">
                                            {msg.text}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 我的消息布局 */}
                        {msg.isMine && (
                            <div className="flex items-start max-w-[85%] justify-end">
                                <div className="flex flex-col items-end">
                                    <div className="relative bg-[#95ec69] text-black px-3 py-2.5 rounded-md shadow-sm border border-[#82d65c]">
                                        {/* 右侧尖角 */}
                                        <div className="absolute top-[14px] -right-[5px] w-0 h-0
                                border-t-[6px] border-t-transparent
                                border-l-[6px] border-l-[#95ec69]
                                border-b-[6px] border-b-transparent">
                                        </div>

                                        <p className="text-[15px] break-words whitespace-pre-wrap leading-snug">
                                            {msg.text}
                                        </p>
                                    </div>
                                </div>
                                {/* 点击我的头像 */}
                                <img
                                    src={myAvatar}
                                    alt="我"
                                    className="w-10 h-10 rounded-md ml-3 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => setShowAvatarPicker(true)}
                                    title="点击更换头像"
                                />
                            </div>
                        )}


                    </div>
                        </React.Fragment>
                );
                })}
                <div ref={messagesEndRef} />
            </div>

            <div className="bg-gray-50 border border-gray-200 p-3 flex items-center mb-3">
                <div className="flex-1  rounded-lg px-4 py-2 min-h-[60px] relative">
                    <textarea
                        className="bg-gray w-full h-full bg-transparent border-none outline-none resize-none"
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                                e.preventDefault(); // 阻止默认的换行行为
                                send();
                            }
                        }}
                        placeholder={`${inputMessagePlaceholder[myLang]}`}
                        rows={2}
                    ></textarea>

                </div>
                <button onClick={send}
                        className="bg-green-500 text-white w-12 h-12 rounded-full flex items-center justify-center ml-1">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    </svg>
                </button>
            </div>
        </div>)}
    </div>);
}
