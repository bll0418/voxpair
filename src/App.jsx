import React, {useState, useEffect, useRef} from 'react';
import Peer from 'peerjs';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
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
const getHistoryKey = (targetId, currentId) => {
    if (!targetId || !currentId) return null;
    return `chat_history_${targetId}_${currentId}`;
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

const getPeer = (peerId) => {
    return new Peer(peerId, {
        host: 'peerjs.asktraceai.com',
        port: 443,
        secure: true,
        path: '/',
        config: {
            iceServers: [
                {urls: 'stun:stun.l.google.com:19302'},
                {urls: 'stun:stun1.l.google.com:19302'},
                // 加国内快 STUN（可选）
                {urls: 'stun:stun.qq.com:3478'}
            ]
        }
    })
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
            <Route path="/:urlId/:urlLang" element={<ChatRoom />} />
            <Route path="/" element={<ChatRoom />} />
        </Routes>
    );
}


function ChatRoom() {
    const {urlId, urlLang } = useParams();
    const navigate = useNavigate();

    const [myLang, setMyLang] = useState('zh');
    const [theirLang, setTheirLang] = useState('en');
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [connected, setConnected] = useState(false);
    const [isCopied, setIsCopied] = useState(false);


    const peerRef = useRef(null);
    const connRef = useRef(null);
    const messagesEndRef = useRef(null);


    //我的id从缓存获取或自动生成
    const myPeerId = getMyPeerId();
    const myPeerIdRef = useRef(myPeerId);
    const myLangRef = useRef(urlLang || 'zh');
    //对方的id从url中获取
    const theirPeerIdRef = useRef(urlId);
    const theirLangRef = useRef('en');

    //加载历史记录
    const loadHistory = (targetId, currentId) => {
        const key = getHistoryKey(targetId, currentId);
        if (key) {
            const saved = sessionStorage.getItem(key);
            if (saved) {
                const parsed = JSON.parse(saved);
                console.log(`加载历史记录 [${key}]:`, parsed.length, "条");
                setMessages(parsed);
            } else {
                setMessages([]);
            }
        }
    };


    const copyId = async () => {
        if (!myPeerIdRef.current) return;
        try {
            await navigator.clipboard.writeText(`${import.meta.env.VITE_APP_BASE_URL}/${myPeerIdRef.current}/${theirLang}`);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (e) {
            console.error('复制失败',e);
        }
    };


    const changeMyLang = async (newLang) => {

        myLangRef.current = newLang
        console.log('change我的语言：' + newLang);
        if (connRef.current && connected) {
            connRef.current.send({
                type: 'lang',
                lang: newLang
            });
        }
    };

    const setupConn = (conn) => {
        conn.on('data', async (data) => {
            if (data.type === 'init') {
                console.log('监听到init数据,加载历史记录，保存对方的id:', data.id + ',对方语言:' + data.lang);
                theirPeerIdRef.current = data.id;
                theirLangRef.current = data.lang;
                loadHistory(theirPeerIdRef.current, myPeerIdRef.current);

                if (!urlId) {
                    console.log('url自动跳转');
                    navigate(`/${theirPeerIdRef.current}/${myLangRef.current}`, { replace: true });
                }
            } else if (data.type === 'lang') {
                console.log('监听lang数据，保存对方语言:' + data.lang);
                theirLangRef.current = data.lang;
            } else if (data.type === 'msg') {
                console.log('监听到msg数据:'+ data.text +',对方的语言:', data.lang + ',我的语言:' + myLangRef.current);

                const translated = await translate(data.text, data.lang, myLangRef.current);
                const newMessage = {
                    text: translated,
                    original: data.text,
                    isMine: false
                };

                setMessages(prev => {
                    const updated = [...prev, newMessage];
                    // 使用新格式 Key 保存：conn.peer 是对方，myIdRef.current 是自己
                    const key = getHistoryKey(theirPeerIdRef.current, myPeerIdRef.current);
                    if (key) sessionStorage.setItem(key, JSON.stringify(updated));
                    return updated;
                });
            }
        });

        // 监听连接错误
        conn.on('error', (err) => {
            console.error('连接失败:', err);
        });
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages,myLang,urlId,urlLang]);

    useEffect(() => {
        try {

            if (urlId && urlLang) {
                console.log('通过分享链接打开,获取对方的id:', urlId + ',我的语言:' + urlLang)
                theirPeerIdRef.current = urlId;
                myLangRef.current = urlLang;
                setMyLang(myLangRef.current);
            }else{
                console.log('通过主页打开,开始生成我的id');
            }

            // if(peerRef.current){
            //     console.log('peer已存在，不重复创建');
            //     return;
            // }
            const peer =  getPeer(myPeerIdRef.current);
            peerRef.current = peer;
            console.log('创建我的Peer实例:', myPeerIdRef.current)

            peer.on('open', () => {
                if (urlId) {
                    console.log('检测到url中有目标id，正在尝试连接对方:'+ urlId);
                    theirPeerIdRef.current = urlId;
                    const conn = peer.connect(urlId);
                    connRef.current = conn;
                    setupConn(conn);

                    // 在连接打开后再发送init消息
                    conn.on('open', () => {
                        console.log('连接成功,加载历史聊天记录');
                        loadHistory(theirPeerIdRef.current, myPeerIdRef.current);
                        console.log('连接成功,发送我的信息id:' + myPeerIdRef.current + ",myLang:" + myLangRef.current);
                        setConnected(true);
                        conn.send({type: 'init', lang: myLangRef.current, id: myPeerIdRef.current});
                    });
                }
            });

            peer.on('connection', (conn) => {
                console.log('收到新的连接');
                connRef.current = conn;
                setConnected(true);
                conn.send({type: 'init', lang: myLangRef.current, id: myPeerIdRef.current});
                setupConn(conn);
            });

            peer.on('error', (err) => {
                console.error('Peerjs错误:', err);
            });
        } catch (error) {
            console.error('Peer.js 初始化失败:', error);
        }

        return () => {
            if (peerRef.current) {
                console.log('销毁Peer实例');
                peerRef.current.destroy();
            }
        };
    }, []);

    const send = async () => {
        if (!message.trim() || !connRef.current || !connRef.current.open) return;
        console.log('发送信息:' + message + ',我的语言:' + myLangRef.current);
        connRef.current.send({
            type: 'msg',
            text: message,
            lang: myLangRef.current
        });
        const newMessage = { text: message, isMine: true };
        setMessages(prev => {
            const updated = [...prev, newMessage];
            // 使用新格式 Key 保存
            const key = getHistoryKey(theirPeerIdRef.current, myPeerIdRef.current);
            if (key) sessionStorage.setItem(key, JSON.stringify(updated));
            return updated;
        });
        setMessage('');
    };


    return (<div className="min-h-screen bg-gray-100 flex flex-col">
        {!connected && !urlId && !urlLang ? (<div className="max-w-lg mx-auto mt-20 p-8 bg-white rounded-2xl shadow-2xl">
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
                    value={import.meta.env.VITE_APP_BASE_URL.replace('https://', '') + '/' + myPeerId + '/' + theirLang}
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


            <div className="mb-8">
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

            <div className="mb-8">
                <label className="block text-lg font-medium mb-3">对方语言</label>
                <select
                    className="w-full border-2 border-gray-300 rounded-xl px-5 py-4 text-lg bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none"
                    value={theirLang}
                    onChange={e => setTheirLang(e.target.value)}
                >
                    {Object.entries(languages).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                    ))}
                </select>

            </div>

        </div>) : (<div className="max-w-2xl w-full mx-auto flex flex-col h-screen bg-gray-100">

            <div className="bg-gray-50 px-4 py-3 text-center  border-b border-gray-200  flex items-center justify-between shadow-sm">
                <h2 className="text-xl font-bold text-black pl-1.5"># {urlId}</h2>
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


            <div className="flex-1 overflow-y-auto px-4 py-6">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex mb-4 ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                        {!msg.isMine &&
                            <img src={theirAvatar} alt="对方" className="w-10 h-10 rounded-full mr-2 self-end"/>}

                        <div
                            className={`px-4 py-3 rounded-lg max-w-xs ${msg.isMine ? 'bg-green-500 text-white' : 'bg-white text-black shadow-sm'} border`}>
                            {/* 对方消息：显示原文小字 + 翻译后主文本 */}
                            {!msg.isMine && msg.original && (
                                <p className="text-xs opacity-50 mb-1 whitespace-pre-wrap leading-relaxed">{originalMessageTip[theirLang]}: {msg.original}</p>
                            )}

                            {/* 主文本：自己发原始，对方发翻译后 */}
                            <p className="text-base break-words whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                        </div>

                        {msg.isMine && <img src={myAvatar} alt="我" className="w-10 h-10 rounded-full ml-2 self-end"/>}
                    </div>))}

                <div ref={messagesEndRef}/>
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
