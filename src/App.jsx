import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Check, User, Calendar, LogOut, Settings } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc,
  runTransaction
} from 'firebase/firestore';

// --- 設定エリア (ここを書き換えてください) ---

// ★★★ 運用開始まで false にしておくと、予約ボタンが押せなくなります ★★★
const IS_BOOKING_ENABLED = false; 

// 1. Firebaseの設定 (あなたのキーに書き換えてください)
const firebaseConfig = {
  apiKey: "AIzaSy...", 
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:xxxxx"
};

// 2. EmailJSの設定 (あなたのIDに書き換えてください)
const EMAILJS_SERVICE_ID = "service_fm6jzqn"; 
const EMAILJS_TEMPLATE_ID = "template_63qq8aj";
const EMAILJS_PUBLIC_KEY = "user_JRZlYnM7gukOpjDw9";

// 3. 管理者のメールアドレス (このアドレスでログインすると管理画面が見れます)
const ADMIN_EMAIL = "admin@studio.com";

// ---------------------------------------------

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// アプリID識別用（通常は固定でOK）
const appId = 'studio-booking-v1';

// --- Constants ---

const STUDIOS = [
  { id: 'A', name: 'A', color: '#cc7b9b', price: 1100 },
  { id: 'B', name: 'B', color: '#7aa6c7', price: 1100 },
  { id: 'C', name: 'C', color: '#7fc980', price: 1980 },
  { id: 'EF', name: 'EF', color: '#7988c7', price: 2310 },
  { id: 'R', name: 'R', color: '#d9c46e', price: 2090 },
];

const TIME_SLOTS = Array.from({ length: 15 }, (_, i) => {
  const start = 7 + i;
  return {
    id: `${start}`,
    label: `${start.toString().padStart(2, '0')}:00～${(start + 1).toString().padStart(2, '0')}:00`
  };
});

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

// --- Helper Functions ---

const getJSTDate = () => {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
};

const formatDateKey = (date) => {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};

const formatMonthYear = (date) => {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
};

const isSameDay = (d1, d2) => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

// キャンセル可能か判定（3日前まで）
const isCancellable = (dateKey) => {
  const bookingDate = new Date(dateKey);
  const today = getJSTDate();
  bookingDate.setHours(0,0,0,0);
  today.setHours(0,0,0,0);
  const diffTime = bookingDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 3;
};

// Email送信関数
const sendEmailNotification = async (userEmail, userName, bookingDetails) => {
  console.log(`[EmailJS] Sending email to ${userEmail}...`);
  
  // 本番環境でEmailJSを有効にする場合は以下のコメントアウトを外してください
  /*
  try {
    // window.emailjs は index.html で読み込むか、npm install @emailjs/browser している前提
    // npmの場合: import emailjs from '@emailjs/browser'; が必要ですが、
    // 簡易実装のためここでは擬似コードとしています。
    // 実際の実装:
    // await emailjs.send(
    //   EMAILJS_SERVICE_ID,
    //   EMAILJS_TEMPLATE_ID,
    //   {
    //     to_email: userEmail,
    //     to_name: userName,
    //     message: bookingDetails.map(b => `${b.dateKey} ${b.timeLabel} Studio${b.studioName}`).join('\n')
    //   },
    //   EMAILJS_PUBLIC_KEY
    // );
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Email send failed:", error);
  }
  */
};

// --- Components ---

// 1. Authentication Screen
const AuthScreen = () => {
  const [mode, setMode] = useState('login');
  const [formData, setFormData] = useState({
    email: '', password: '', name: '', groupName: '', address: '', phone: '', genre: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, formData.email, formData.password);
      } else if (mode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        const user = userCredential.user;
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid), {
          name: formData.name,
          groupName: formData.groupName,
          address: formData.address,
          phone: formData.phone,
          genre: formData.genre,
          email: formData.email,
          createdAt: new Date().toISOString()
        });
        await updateProfile(user, { displayName: formData.name });
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, formData.email);
        setMessage('パスワード再設定メールを送信しました。');
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error(err);
      let msg = 'エラーが発生しました。';
      if (err.code === 'auth/email-already-in-use') msg = 'このメールアドレスは既に使用されています。';
      if (err.code === 'auth/wrong-password') msg = 'パスワードが間違っています。';
      if (err.code === 'auth/user-not-found') msg = 'ユーザーが見つかりません。';
      if (err.code === 'auth/weak-password') msg = 'パスワードは6文字以上にしてください。';
      setError(msg);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0f1c2e] flex items-center justify-center p-4 font-sans text-gray-100">
      <div className="bg-[#162438] p-8 rounded-lg shadow-xl max-w-md w-full border border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          {mode === 'login' ? 'ログイン' : mode === 'register' ? '新規会員登録' : 'パスワード再設定'}
        </h2>
        {error && <div className="bg-red-500/20 text-red-300 p-3 rounded mb-4 text-sm">{error}</div>}
        {message && <div className="bg-green-500/20 text-green-300 p-3 rounded mb-4 text-sm">{message}</div>}

        <form onSubmit={handleAuth} className="space-y-4">
          {mode === 'register' && (
            <>
              <div><label className="block text-gray-400 text-xs mb-1">氏名（実名） *</label><input required name="name" className="w-full bg-[#0f1c2e] border border-gray-600 rounded p-2 text-white" onChange={handleChange} /></div>
              <div><label className="block text-gray-400 text-xs mb-1">団体名</label><input name="groupName" className="w-full bg-[#0f1c2e] border border-gray-600 rounded p-2 text-white" onChange={handleChange} /></div>
              <div><label className="block text-gray-400 text-xs mb