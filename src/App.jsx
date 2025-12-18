import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';

const languages = {
    zh: '中文',
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ja: '日本語',
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
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        conn.send({ type: 'lang', lang: myLang });

        conn.on('data', async (data) => {
            if (data.type === 'lang') {
                setTheirLang(data.lang);
            } else if (data.type === 'msg') {
                // 关键：使用对方发送的 lang 作为源语言
                const translated = await translate(data.text, data.lang, myLang);
                setMessages(prev => [...prev, {
                    text: translated,
                    original: data.text,
                    isMine: false
                }]);
            }
        });
    };

    const connect = () => {
        const conn = peerRef.current.connect(remoteId);
        connRef.current = conn;
        conn.on('open', () => {
            setConnected(true);
            conn.send({ type: 'lang', lang: myLang }); // 发送语言
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
            type: 'msg',
            text: message,      // 原始文本
            lang: myLang        // 自己的语言代码！！！
        });

        setMessages(prev => [...prev, {
            text: message,
            translated,
            isMine: true
        }]);
        setMessage('');
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {!connected ? (
                <div className="max-w-lg mx-auto mt-20 p-8 bg-white rounded-2xl shadow-2xl">
                    <h1 className="text-4xl font-bold text-center mb-8">TransChat - 跨语言实时聊天</h1>
                    <p className="text-center mb-6 text-lg">
                        <strong className="text-green-600">{myId || '加载中...'}</strong><br />
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
                            className="w-full border-2 border-gray-300 rounded-xl px-5 py-4 text-lg"
                            value={myLang}
                            onChange={e => setMyLang(e.target.value)}
                        >
                            {Object.entries(languages).map(([code, name]) => (
                                <option key={code} value={code}>{name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={connect}
                        className="w-full bg-green-600 text-white py-5 rounded-xl text-xl font-semibold hover:bg-green-700 shadow-lg"
                    >
                        连接
                    </button>
                </div>
            ) : (
                <div className="max-w-2xl w-full mx-auto flex flex-col h-screen bg-gray-100">
                    <div className="bg-white px-4 py-3 text-center border-b">
                        <h2 className="text-lg font-semibold">跨语言聊天 ({languages[myLang]})</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-6">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex mb-4 ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                                {!msg.isMine && <img src={theirAvatar} alt="对方" className="w-10 h-10 rounded-full mr-3 self-end" />}



                                    <div className={`px-4 py-3 rounded-2xl ${msg.isMine ? 'bg-green-500 text-white' : 'bg-white text-black shadow-md'}`}>
                                        {/* 对方消息：显示原文小字 + 翻译后主文本 */}
                                        {!msg.isMine && msg.original && (
                                            <p className="text-xs opacity-70 mb-1">原文: {msg.original}</p>
                                        )}

                                        {/* 主文本：自己发原始，对方发翻译后 */}
                                        <p className="text-base break-words">{msg.text}</p>

                                </div>




                                {msg.isMine && <img src={myAvatar} alt="我" className="w-10 h-10 rounded-full ml-3 self-end" />}
                            </div>
                        ))}

                        <div ref={messagesEndRef} />
                    </div>

                    <div className="bg-white border-t p-3 flex items-center">
                        <input className="flex-1 border rounded-full px-5 py-3 mr-2" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="输入消息..." />
                        <button onClick={send} className="bg-green-500 text-white w-12 h-12 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
