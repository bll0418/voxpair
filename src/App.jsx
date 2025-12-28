import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';

const AVATAR_LIST = [
    '/assets/avatar/1.jpg', '/assets/avatar/2.jpg', '/assets/avatar/3.jpg', '/assets/avatar/4.jpg',
    '/assets/avatar/5.jpg', '/assets/avatar/6.jpg', '/assets/avatar/7.jpg', '/assets/avatar/8.jpg',
    '/assets/avatar/9.jpg', '/assets/avatar/10.jpg', '/assets/avatar/11.jpg', '/assets/avatar/14.jpg',
    '/assets/avatar/13.jpg', '/assets/avatar/14.jpg', '/assets/avatar/15.jpg', '/assets/avatar/16.jpg',
    '/assets/avatar/17.jpg', '/assets/avatar/18.jpg'
];

const languages = {zh: '中文', en: 'English', fr: 'Français', de: 'Deutsch', ja: '日本語'};
const originalMessageTip = {zh: '原文', en: 'original', fr: 'original', de: 'Deutsch', ja: '原文'};
const inputMessagePlaceholder = {
    zh: '输入消息...',
    en: 'Input message..',
    fr: 'Saisissez votre message...',
    de: 'Geben Sie Ihre Nachricht ein...',
    ja: 'メッセージを入力してください...'
};

const logger = (message) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    console.log(`[${timestamp}] ${message}`);
};

const generateUsername = () => {
    const s = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const n = "0123456789";
    const r = (src, len) => Array.from({length: len}, () => src[Math.floor(Math.random() * src.length)]).join('');
    return r(s, 4) + r(n, 3);
};

//获取我的id,先从localStorage中获取
const getMyPeerId = () => {
    let myPeerId = localStorage.getItem('myPeerId');
    if (!myPeerId) {
        myPeerId = generateUsername();
        localStorage.setItem('myPeerId', myPeerId);
    }
    return myPeerId;
};

const getHistoryKey = (roomId) => roomId ? `chat_history_${roomId}` : null;

const translate = async (text, sourceLang, targetLang) => {
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

export function App() {
    return (
        <Routes>
            <Route path="/:urlRoomId" element={<ChatRoom />} />
            <Route path="/" element={<ChatRoom />} />
        </Routes>
    );
}

function ChatRoom() {
    const { urlRoomId } = useParams();
    const myPeerId = getMyPeerId();

    // 状态定义
    const [myAvatar, setMyAvatar] = useState(() => {
        let savedIndex = localStorage.getItem('myAvatar');
        if(!savedIndex){
            savedIndex = Math.floor(Math.random() * AVATAR_LIST.length);
            localStorage.setItem('myAvatar', savedIndex);
        }
        return AVATAR_LIST[savedIndex];
    });
    const [myLang, setMyLang] = useState(() => localStorage.getItem('myLang') || 'zh');
    const [myNickname, setMyNickname] = useState(() => localStorage.getItem('myNickname') || myPeerId);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [connected, setConnected] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [activeView, setActiveView] = useState('main');
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempNickname, setTempNickname] = useState(myNickname);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [viewingUser, setViewingUser] = useState(null);

    // Refs
    const wsRef = useRef(null);
    const messagesEndRef = useRef(null);
    const heartbeatIntervalRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const roomIdRef = useRef(urlRoomId || myPeerId);

    const handleNicknameSubmit = (e) => {
        if (!e || !e.key || e.key === 'Enter') {
            const regex = /^[\p{L}\p{N}_-]{1,20}$/u;
            if (!regex.test(tempNickname)) {
                alert("昵称需为1-20位，支持所有语言文字、数字、下划线或减号");
                return;
            }
            setMyNickname(tempNickname);
            localStorage.setItem('myNickname', tempNickname);
            setIsEditingName(false);
        }
    };

    // 3. 更换头像的处理函数
    const changeAvatar = (newAvatar) => {
        // 将头像编号存储到缓存，而不是完整路径
        const avatarIndex = AVATAR_LIST.indexOf(newAvatar);
        if (avatarIndex !== -1) {
            localStorage.setItem('myAvatar', avatarIndex.toString());
            setMyAvatar(newAvatar);
            setActiveView('main');
        }
    };

    const copyId = async () => {
        if (!myPeerId) return;
        try {
            await navigator.clipboard.writeText(`${import.meta.env.VITE_APP_BASE_URL}/${myPeerId}`);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (e) {
            console.error('复制失败', e);
        }
    };


    const changeMyLang = async (newLang) => {
        setMyLang(newLang);
        logger('change我的语言：' + newLang);
        localStorage.setItem('myLang', newLang);
    };

    useEffect(() => {
        roomIdRef.current = urlRoomId || myPeerId;
        const key = getHistoryKey(roomIdRef.current);
        const saved = localStorage.getItem(key);
        setMessages(saved ? JSON.parse(saved) : []);
    }, [urlRoomId, myPeerId]);

    const connect = useCallback(() => {
        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
            return;
        }

        clearInterval(heartbeatIntervalRef.current);
        clearTimeout(reconnectTimerRef.current);

        const ws = new WebSocket(`wss://chatbackend.asktraceai.com?roomId=${roomIdRef.current}`);
        wsRef.current = ws;

        ws.onopen = () => {
            //通过分享链接或有聊天历史的情况下，自己跳转到房间
            if(urlRoomId || localStorage.getItem(getHistoryKey(roomIdRef.current)) ){
                setConnected(true);
            }

            logger('发送init消息，向房间里的所有人,告之自己的语言,myPeerId:' + myPeerId + ',myLang:' + myLang);
            ws.send(JSON.stringify({
                type: 'init',
                id: myPeerId,
                lang: myLang
            }));

            heartbeatIntervalRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN){
                    logger('发送心跳包');
                    ws.send(JSON.stringify({type: 'p'}))
                }
            }, 80000);
        };

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'p'){
                logger('收到心跳包');
                return;
            }
            if (data.type === 'history_sync') {
                logger(`收到历史同步，条数: ${data.data.length}`);

                // 1. 获取本地已有的消息 ID 集合，用于去重和判断是否需要翻译
                const existingIds = new Set(messages.map(m => m.id));
                const historyKey = getHistoryKey(roomIdRef.current);
                const cachedData = JSON.parse(localStorage.getItem(historyKey) || '[]');
                const cacheMap = new Map(cachedData.map(m => [m.id, m]));

                // 2. 准备异步翻译任务
                const translatedHistory = await Promise.all(data.data.map(async (m) => {
                    const msgId = m.id;
                    const isMine = m.sender === myPeerId;

                    // 如果本地缓存中已经有了这条 ID 的翻译结果，直接使用
                    if (cacheMap.has(msgId)) {
                        return cacheMap.get(msgId);
                    }

                    // 如果是新消息且不是自己的，且语言不通，则进行翻译
                    let displayText = m.content;
                    if (!isMine && m.lang !== myLang) {
                        displayText = await translate(m.content, m.lang, myLang);
                    }

                    return {
                        id: msgId,
                        text: displayText,          // 译文
                        original: m.content,        // 原文
                        from: m.sender,
                        lang: m.lang,
                        isMine: isMine,
                        time: new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour12: false }),
                        avatar: m.avatar,
                        nickname: m.nickname,
                        timestamp: m.timestamp
                    };
                }));

                // 3. 合并新老数据并去重排序
                setMessages(prev => {
                    const combined = [...prev, ...translatedHistory];
                    const uniqueMap = new Map();

                    combined.forEach(msg => {
                        // 优先保留带有译文的记录
                        uniqueMap.set(msg.id, msg);
                    });

                    const finalMessages = Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);

                    // 4. 最后一起写入本地缓存
                    if (historyKey) {
                        localStorage.setItem(historyKey, JSON.stringify(finalMessages));
                    }

                    return finalMessages;
                });
                return;
            }

            if (data.type === 'init') {
                logger('收到init消息,对方peerId:' + data.id + ',lang:' + data.lang);
                setConnected(true);
            } else if (data.type === 'msg') {
                logger('监听msg数据:' + data.text + ',对方的id:' + data.from + ',对方的语言:', data.lang + ',我的语言:' + myLang);
                setConnected(true);
                const translated = await translate(data.text, data.lang, myLang);
                const newMessage = {
                    id: data.id,
                    text: translated,
                    original: data.text,
                    from: data.from,
                    lang: data.lang,
                    isMine: false,
                    time: data.time,
                    avatar: data.avatar,
                    nickname: data.nickname
                };
                setMessages(prev => {
                    const updated = [...prev, newMessage];
                    localStorage.setItem(getHistoryKey(roomIdRef.current), JSON.stringify(updated));
                    return updated;
                });
            }
        };

        ws.onclose = () => {
            setConnected(false);
           // reconnectTimerRef.current = setTimeout(connect, 5000);
        };
    }, [urlRoomId, myPeerId, myLang]); // 依赖 myLang 确保翻译语言正确

    useEffect(() => {
        connect();
        return () => {
            clearInterval(heartbeatIntervalRef.current);
            clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, [connect, urlRoomId]);


    const send = () => {
        if (!message.trim()) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            connect();
            return;
        }

        const msgId = `${Math.random().toString(36).substring(2, 6)}_${Date.now()}`; // 生成临时ID
        const time = new Date().toLocaleTimeString('zh-CN', {hour12: false});
        const msgData = {
            id: msgId,
            type: 'msg',
            from: myPeerId,
            text: message,
            time: time,
            lang: myLang,
            avatar: AVATAR_LIST.indexOf(myAvatar),
            nickname: myNickname
        };

        wsRef.current.send(JSON.stringify(msgData));

        // 本地即时显示
        const mySendMessage = { ...msgData,  isMine: true  };

        setMessages(prev => {
            const updated = [...prev, mySendMessage];
            localStorage.setItem(getHistoryKey(roomIdRef.current), JSON.stringify(updated));
            return updated;
        });
        setMessage('');
    };

    // 滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (<div className="min-h-screen bg-gray-100 flex flex-col">
        {showAvatarPicker && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity"
                 onClick={() => { setShowAvatarPicker(false); setActiveView('main'); setViewingUser(null); }}>

                {/* 固定尺寸容器 320x400 */}
                <div className="bg-white rounded-3xl shadow-2xl w-80 h-[400px] overflow-hidden flex flex-col relative" onClick={e => e.stopPropagation()}>

                    {/* 右上角关闭图标 (统一存在) */}
                    <button
                        onClick={() => { setShowAvatarPicker(false); setActiveView('main'); setViewingUser(null); }}
                        className="absolute top-4 right-4 z-20 p-1 rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* 情况 A：查看他人资料 */}
                    {viewingUser ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8">
                            <img src={AVATAR_LIST[viewingUser.avatar]} className="w-28 h-28 rounded-3xl shadow-lg border-4 border-gray-50 object-cover" alt="Avatar" />
                            <div className="mt-8 flex flex-col items-center">
                                <h3 className="text-2xl font-bold text-gray-800 truncate max-w-[240px]">{viewingUser.nickname}</h3>
                                <p className="text-gray-300 text-[11px] mt-4 tracking-widest ">ID: {viewingUser.id}</p>
                            </div>
                        </div>
                    ) : (
                        /* 情况 B：我自己的资料 (原有逻辑) */
                        <>
                            {activeView === 'main' ? (
                                <div className="flex-1 flex flex-col items-center justify-center p-8">
                                    <div className="relative group cursor-pointer" onClick={() => setActiveView('avatar')}>
                                        <img src={myAvatar} className="w-28 h-28 rounded-3xl shadow-lg border-4 border-gray-50 object-cover" alt="Avatar" />
                                        <div className="absolute inset-0 bg-black/40 rounded-3xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all text-white text-xs font-medium">更换头像</div>
                                    </div>
                                    <div className="mt-8 w-full flex flex-col items-center min-h-[100px]">
                                        {!isEditingName ? (
                                            <div className="group cursor-pointer flex items-center gap-2" onClick={() => { setTempNickname(myNickname); setIsEditingName(true); }}>
                                                <h3 className="text-2xl font-bold text-gray-800 truncate max-w-[200px]">{myNickname}</h3>
                                                <svg className="w-4 h-4 text-gray-300 group-hover:text-green-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                            </div>
                                        ) : (
                                            <input autoFocus
                                                   className="w-full border-b-2 border-green-500 outline-none py-1 text-center text-xl font-bold bg-transparent"
                                                   value={tempNickname}
                                                   onChange={e => setTempNickname(e.target.value)}
                                                   onKeyDown={handleNicknameSubmit}
                                                   onBlur={() => handleNicknameSubmit()}/>
                                        )}
                                        <p className="text-gray-300 text-[11px] mt-4 tracking-widest ">ID: {myPeerId}</p>
                                    </div>
                                </div>
                            ) : (
                                /* 头像选择页 (原有逻辑) */
                                <div className="flex flex-col h-full">
                                    <div className="p-4 border-b border-gray-50 flex items-center bg-gray-50/30">
                                        <button onClick={() => setActiveView('main')} className="p-1 hover:bg-white rounded-full transition-shadow shadow-sm">
                                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        </button>
                                        <h3 className="flex-1 text-center font-bold text-gray-700 mr-8">选择新头像</h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
                                        <div className="grid grid-cols-3 gap-3">
                                            {AVATAR_LIST.map((src, idx) => (
                                                <img key={idx} src={src} className={`w-full aspect-square rounded-2xl cursor-pointer border-[3px] transition-all object-cover ${myAvatar === src ? 'border-green-500 scale-105' : 'border-transparent opacity-80 hover:opacity-100'}`} onClick={() => { changeAvatar(src); setActiveView('main'); }} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
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
                <h2 className="text-xl font-bold text-black pl-1.5"># {roomIdRef.current}</h2>
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
                                <img
                                    src={AVATAR_LIST[parseInt(msg.avatar)]}
                                    alt="对方"
                                    className="w-10 h-10 rounded-md mr-3 mt-5 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => {
                                        // 设置要查看的用户信息
                                        setViewingUser({
                                            id: msg.from,
                                            nickname: msg.nickname,
                                            avatar: msg.avatar
                                        });
                                        setShowAvatarPicker(true);
                                    }}
                                />
                                <div className="flex flex-col">
                                    {/* PeerID 放在消息上方，颜色淡化 */}
                                    <span className="text-[11px] text-gray-400 mb-1 ml-0.5">{msg.nickname || msg.from}</span>

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
