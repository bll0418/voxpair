import React, {useState, useEffect, useRef} from 'react';
import Peer from 'peerjs';
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
    fr: 'Français',
    de: 'Deutsch',
    ja: '日本語',
};

const inputMessagePlaceholder = {
    zh: '输入消息...',
    en: 'Input message..',
    fr: 'Français',
    de: 'Deutsch',
    ja: '日本語',
};

//用户id:4位字母 + 3位数字
const generateUsername = () => {
    const chars1 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const chars2 = '0123456789';
    let result = "";
    for (let i = 0; i < 4; i++) {
        result += chars1.charAt(Math.floor(Math.random() * chars1.length));
    }
    for (let i = 0; i < 3; i++) {
        result += chars2.charAt(Math.floor(Math.random() * chars2.length));
    }
    return result;
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
            <Route path="/:urlId/:urlLang" element={<ChatRoom />} />
            {/* 默认路径 / 显示连接页面 */}
            <Route path="/" element={<ChatRoom />} />
        </Routes>
    );
}


function ChatRoom() {
    const {urlId, urlLang } = useParams();
    const [myId, setMyId] = useState('');
    const [remoteId, setRemoteId] = useState('');
    const [myLang, setMyLang] = useState('zh');
    const [theirLang, setTheirLang] = useState('en');
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [connected, setConnected] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const myLangRef = useRef(myLang);
    const myIdRef = useRef(null);
    const peerRef = useRef(null);
    const connRef = useRef(null);
    const messagesEndRef = useRef(null);
    const linkOpen = useRef(false);
    const peerId = useRef( null);

    useEffect(() => {
        console.log('URL 参数:', { urlId, urlLang });
        if (urlId && urlLang) {
            console.log('通过链接打开,获取对方的id:', urlId + ',我的语言:' + urlLang)
            peerId.current = urlId;
            myLangRef.current = urlLang;
            setMyLang(myLangRef.current);
            linkOpen.current = true;
        }
    }, [urlId, urlLang]);

    // useEffect(() => {
    //     const urlParams = new URLSearchParams(window.location.search);
    //     peerId.current = urlParams.get('Id');
    //     console.log('打开时,获取对方的id:', peerId.current + ',我的语言:' + myLangRef.current);
    //
    //     if (peerId.current) {
    //         myLangRef.current = urlParams.get('lang');
    //         setMyLang(myLangRef.current);
    //         linkOpen.current = true;
    //     }
    // }, [myLang])


    const copyId = async () => {
        if (!myId) return;
        try {
            await navigator.clipboard.writeText(`${import.meta.env.VITE_APP_BASE_URL}/${myId}/${theirLang}`);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000); // 2秒后恢复
        } catch (e) {
            console.error('复制失败',e);
            alert('复制失败');
        }
    };



    const changeMyLang = async (lang) => {
        setMyLang(lang);
        myLangRef.current = lang
        console.log('change我的语言：' + lang);
    };

    const setupConn = (conn) => {
        //conn.send({type: 'init', lang: myLang, id: myId});

        conn.on('data', async (data) => {
            if (data.type === 'init') {
                console.log('监听init数据，保存对方的id:', data.id + ',和对方语言:' + data.lang);
                setRemoteId(data.id);
                setTheirLang(data.lang);
                setMyLang(myLangRef.current);
            } else if (data.type === 'lang') {
                console.log('监听lang数据，保存对方语言:' + data.lang);
                setTheirLang(data.lang);
            } else if (data.type === 'msg') {
                console.log('监听msg数据，对方的语言:', data.lang + ',我的语言:' + myLangRef.current);
                const translated = await translate(data.text, data.lang, myLangRef.current);
                setMessages(prev => [...prev, {
                    text: translated, original: data.text, isMine: false
                }]);

            }
        });
    };

    // 创建一个新的函数来处理连接，接收peerId作为参数
    const connectWithPeerId = (remoteId,lang) => {
        console.log('正在尝试连接对方:' + remoteId);
        if (!remoteId.trim()) return;

        try {
            const conn = peerRef.current.connect(remoteId);
            connRef.current = conn;

            console.log('已连接:' + myId + ",lang:" + myLang);

            // 监听连接打开事件
            conn.on('open', () => {
                setConnected(true);
                console.log('连接成功后发送我的信息id:' + myIdRef.current + ",lang:" + lang);
                conn.send({type: 'init', lang: lang, id: myIdRef.current});
                setupConn(conn);
            });

            // 监听连接错误
            conn.on('error', (err) => {
                console.error('连接失败:', err);
            });
        } catch (error) {
            console.error('连接过程中发生错误:', error);
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    useEffect(() => {
        const shortId = generateUsername();
        try {
            const peer = new Peer(shortId);

            peerRef.current = peer;

            peer.on('open', (id) => {
                console.log('生成我的id:', id);
                setMyId(id);
                myIdRef.current = id;

                console.log("是否链接打开：" + linkOpen.current);
                if (linkOpen.current) {
                    const linkParams = new URLSearchParams(window.location.search);
                    const langParam = linkParams.get('lang');
                    console.log('通过链接打开时,设置对方的id:', peerId.current + ',和我的语言:' + langParam);
                    // 只在没有默认值时才设置
                    if (!myLang && langParam) {
                        setMyLang(langParam);
                    }
                    setRemoteId(peerId.current);
                    // 直接使用peerId而不是remoteId状态变量，因为状态更新是异步的
                    connectWithPeerId(peerId.current, linkParams.get('lang'));
                }else {
                    console.log('我的语言：' + myLang);
                }

            });

            peer.on('connection', (conn) => {
                connRef.current = conn;
                setConnected(true);
                //当有其他客户端连接我们时，我们也需要发送初始化信息
                conn.send({type: 'init', lang: myLang, id: myId});
                setupConn(conn);
            });

            peer.on('error', (err) => {
                console.error('Peer.js 错误:', err);
                // alert('此链接已失效,请重新获取！')
            });
        } catch (error) {
            console.error('Peer.js 初始化失败:', error);
        }

        return () => {
            if (peerRef.current) {
                peerRef.current.destroy();
            }
        };
    }, []);

    const send = async () => {
        if (!message.trim() || !connRef.current) return;

        console.log('发送信息:' + message + ',我的语言:' + myLang);

        // 关键：发送时带上自己的语言
        connRef.current.send({
            type: 'msg', text: message,      // 原始文本
            lang: myLang        // 自己的语言代码！！！
        });

        setMessages(prev => [...prev, {
            text: message, isMine: true
        }]);
        setMessage('');
    };

    return (<div className="min-h-screen bg-gray-100 flex flex-col">
        {!connected && !urlId && !urlLang ? (<div className="max-w-lg mx-auto mt-20 p-8 bg-white rounded-2xl shadow-2xl">
            <h1 className="text-2xl font-bold text-center mb-8">TransChat-跨语言沟通</h1>
            <p className="text-center mb-6 text-lg">
                <strong className="text-green-600 text-4xl font-bold text-center mb-8">{myId || '加载中...'}</strong><br/>
            </p>
            <div className="text-sm text-gray-600 mr-3 mb-5 text-center">
                 分享链接给对方即可聊天
            </div>

            <div className="mt-2 flex items-center justify-center mb-5">
                <input
                    type="text"
                    value={import.meta.env.VITE_APP_BASE_URL.replace('https://', '') + '/' + myId + '/' + theirLang}
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
            <div className="bg-gray-50 px-4 py-3 text-center  ">
                <h2 className="text-lg font-semibold">{remoteId}</h2>
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
                                <p className="text-xs opacity-50 mb-1 whitespace-pre-wrap leading-relaxed">{originalMessageTip[myLang]}: {msg.original}</p>
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

export default App;
