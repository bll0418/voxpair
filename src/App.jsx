import React, {useState, useEffect, useRef} from 'react';
import Peer from 'peerjs';

const languages = {
    zh: '中文',
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ja: '日本語',
};
const originalMessageTip = {
    zh: '原文',
    en: 'original',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ja: '日本語',
};

const inputMessagePlaceholder = {
    zh: '输入消息...', en: 'Input message..', es: 'Español', fr: 'Français', de: 'Deutsch', ja: '日本語',
};

const generateUsername = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {  // ← 这里从 8 改成 6
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

function App() {
    const [myId, setMyId] = useState('');
    const [remoteId, setRemoteId] = useState('');
    const [myLang, setMyLang] = useState('zh');
    const [theirLang, setTheirLang] = useState('en');
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [connected, setConnected] = useState(false);
    const peerRef = useRef(null);
    const connRef = useRef(null);
    const messagesEndRef = useRef(null);

    // 固定头像（你可以换成自己喜欢的 URL）
    const myAvatar = 'https://randomuser.me/api/portraits/women/1.jpg';     // 你（自己消息用这个）
    const theirAvatar = 'https://randomuser.me/api/portraits/men/1.jpg';    // 对方（对方消息用这个）

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    useEffect(() => {
        const shortId = generateUsername();
        const peer = new Peer(shortId);
        peerRef.current = peer;

        peer.on('open', (id) => setMyId(id));

        peer.on('connection', (conn) => {
            connRef.current = conn;
            setConnected(true);
            setupConn(conn);
        });

        return () => peer.destroy();
    }, []);

    const setupConn = (conn) => {

        // 发送自己的语言和 ID
        conn.send({type: 'init', lang: myLang, id: myId});


        conn.on('data', async (data) => {
            if (data.type === 'init') {
                setTheirLang(data.lang);
                setRemoteId(data.id);  // 保存对方的 ID
            } else if (data.type === 'lang') {
                setTheirLang(data.lang);
            } else if (data.type === 'msg') {
                const translated = await translate(data.text, data.lang, myLang);
                setMessages(prev => [...prev, {
                    text: translated, original: data.text, isMine: false
                }]);
            }
        });
    };

    const connect = () => {
        const conn = peerRef.current.connect(remoteId);
        connRef.current = conn;
        conn.on('open', () => {
            setConnected(true);
            // 发送初始化信息包括语言和自己的 ID
            conn.send({type: 'init', lang: myLang, id: myId});
            setupConn(conn);
        });
    };


    const translate = async (text, sourceLang, targetLang) => {
        if (sourceLang === targetLang || !text.trim()) return text;
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            return data[0].map(segment => segment[0]).join('');
        } catch (e) {
            return text + ' (翻译失败)';
        }
    };

    const send = async () => {
        if (!message.trim() || !connRef.current) return;

        const translated = await translate(message, myLang, theirLang); // 只给自己看小字翻译

        // 关键：发送时带上自己的语言
        connRef.current.send({
            type: 'msg', text: message,      // 原始文本
            lang: myLang        // 自己的语言代码！！！
        });

        setMessages(prev => [...prev, {
            text: message, translated, isMine: true
        }]);
        setMessage('');
    };

    return (<div className="min-h-screen bg-gray-100 flex flex-col">
        {!connected ? (<div className="max-w-lg mx-auto mt-20 p-8 bg-white rounded-2xl shadow-2xl">
            <h1 className="text-4xl font-bold text-center mb-8">TransChat-跨语言实时聊天</h1>
            <p className="text-center mb-6 text-lg">
                <strong className="text-green-600 text-4xl font-bold text-center mb-8">{myId || '加载中...'}</strong><br/>
                <span className="text-sm text-gray-600">分享给对方连接</span>
            </p>

            <input
                className="w-full border-2 border-gray-300 rounded-xl px-5 py-4 mb-8 text-lg"
                placeholder="输入对方 ID"
                value={remoteId}
                onChange={e => setRemoteId(e.target.value)}
            />

            <div className="mb-8">
                <label className="block text-lg font-medium mb-3">我的语言</label>
                <select
                    className="w-full border-2 border-gray-300 rounded-xl px-5 py-4 text-lg bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none"
                    value={myLang}
                    onChange={e => setMyLang(e.target.value)}
                >
                    {Object.entries(languages).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                    ))}
                </select>
                {/* 自定义下拉箭头 */}
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>


            <button
                onClick={connect}
                className="w-full bg-green-600 text-white py-5 rounded-xl text-xl font-semibold hover:bg-green-700 shadow-lg"
            >
                连接
            </button>
        </div>) : (<div className="max-w-2xl w-full mx-auto flex flex-col h-screen bg-gray-100">
            <div className="bg-gray-50 px-4 py-3 text-center  ">
                <h2 className="text-lg font-semibold">{remoteId}</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-6">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex mb-4 ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                        {!msg.isMine &&
                            <img src={theirAvatar} alt="对方" className="w-8 h-8 rounded-full mr-2 self-end"/>}

                        <div
                            className={`px-4 py-3 rounded-lg max-w-xs ${msg.isMine ? 'bg-green-500 text-white' : 'bg-white text-black shadow-sm'} border`}>
                            {/* 对方消息：显示原文小字 + 翻译后主文本 */}
                            {!msg.isMine && msg.original && (
                                <p className="text-xs opacity-50 mb-1">{originalMessageTip[myLang]}: {msg.original}</p>
                            )}

                            {/* 主文本：自己发原始，对方发翻译后 */}
                            <p className="text-base break-words">{msg.text}</p>

                        </div>

                        {msg.isMine && <img src={myAvatar} alt="我" className="w-8 h-8 rounded-full ml-2 self-end"/>}
                    </div>))}

                <div ref={messagesEndRef}/>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-3 flex items-center mb-3">


                <div className="flex-1  rounded-lg px-4 py-2 min-h-[60px] relative">

                    <textarea
                        className="bg-gray w-full h-full bg-transparent border-none outline-none resize-none"
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && send()}
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
