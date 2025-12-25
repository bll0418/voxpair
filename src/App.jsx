import React, {useState, useEffect, useRef} from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
// 然后使用
const myAvatar = '/assets/1.jpg';
const theirAvatar = '/assets/2.jpg';

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
        const ws = new WebSocket(`wss://chat-backend-v2.bll0418.workers.dev/?roomId=${roomId.current}`);
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
                const newMessage = { text: translated, original: data.text, from: data.from, isMine: false };
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
            const msgData = {
                type: 'msg',
                from: myPeerIdRef.current,
                text: message,
                timestamp: new Date().getTime(),
                lang: myLangRef.current
            };

            // 发送给服务器，服务器会转发给对方
            wsRef.current.send(JSON.stringify(msgData));


            const mySendMessage = {text: message, isMine: true };

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


            {/*<div className="flex-1 overflow-y-auto px-4 py-6">*/}
            {/*    {messages.map((msg, i) => (*/}
            {/*    <div key={i} className={`flex mb-4 ${msg.isMine ? 'justify-end' : 'justify-start'}`}>*/}
            {/*        {!msg.isMine && <img src={theirAvatar} alt="对方" className="w-10 h-10 rounded-full mr-2 self-end"/>}*/}
            {/*        {!msg.isMine && <p className="text-xs opacity-50 mb-1 whitespace-pre-wrap leading-relaxed">{msg.from}</p>}*/}
            {/*        <div className={`px-4 py-3 rounded-lg max-w-xs ${msg.isMine ? 'bg-green-500 text-white' : 'bg-white text-black shadow-sm'} border`}>*/}
            {/*            {!msg.isMine && msg.original && (*/}
            {/*                <p className="text-xs opacity-50 mb-1 whitespace-pre-wrap leading-relaxed">{originalMessageTip[theirLang]}: {msg.original}</p>*/}
            {/*            )}*/}
            {/*            <p className="text-base break-words whitespace-pre-wrap leading-relaxed">{msg.text}</p>*/}

            {/*        </div>*/}
            {/*        */}
            {/*        */}
            {/*        {msg.isMine && <img src={myAvatar} alt="我" className="w-10 h-10 rounded-full ml-2 self-end"/>}*/}
            {/*    </div>))}*/}

            {/*    <div ref={messagesEndRef}/>*/}
            {/*</div>*/}

            <div className="flex-1 overflow-y-auto px-4 py-6 bg-[#f5f5f5]">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex mb-6 ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                        {!msg.isMine && (
                            <div className="flex items-start max-w-[85%]">
                                <img src={theirAvatar} alt="对方" className="w-10 h-10 rounded-md mr-3 mt-5 object-cover" />
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
                                {/* 我的头像 */}
                                <img src={myAvatar} alt="我" className="w-10 h-10 rounded-md ml-3 object-cover" />
                            </div>
                        )}
                    </div>
                ))}
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
