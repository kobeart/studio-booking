import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Check, User, Calendar, LogOut, Settings, X, Mail } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  signInAnonymously,
  signInWithCustomToken
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
  runTransaction,
  updateDoc
} from 'firebase/firestore';

// 【重要】ローカル環境でEmailJSを使用する場合：
// 1. ターミナルで `npm install @emailjs/browser` を実行してください。
// 2. 以下の import 文のコメントアウト (//) を外してください。
// 3. その下の「EmailJSモック」の部分を削除またはコメントアウトしてください。

// import emailjs from '@emailjs/browser';

// --- EmailJSモック (プレビュー用/ライブラリがない場合のダミー) ---
const emailjs = {
  init: () => {},
  send: async (serviceId, templateId, params, publicKey) => {
    console.log(`[EmailJS Mock] メール送信シミュレーション:`, params);
    return Promise.resolve({ status: 200, text: "OK" });
  }
};
// -----------------------------------------------------------

// ====================================================================
// --- 設定エリア (ここを書き換えてください) ---
// ====================================================================

// ★★★ 運用開始まで false にしておくと、予約ボタンが押せなくなります ★★★
const IS_BOOKING_ENABLED = false; 

// 1. Firebaseの設定 (あなたのキーに書き換えてください)
const firebaseConfig = {
  apiKey: "AIzaSyA4es-RnZfGenUPgJDzDFQaIh1LBNZRxYc",
  authDomain: "studio-rental-180df.firebaseapp.com",
  projectId: "studio-rental-180df",
  storageBucket: "studio-rental-180df.firebasestorage.app",
  messagingSenderId: "485178815055",
  appId: "1:485178815055:web:f91792229f8c359cf1303a",
  measurementId: "G-EF147DP6ZB"
};

// 2. EmailJSの設定 (あなたのキーに書き換えてください)
const EMAILJS_SERVICE_ID = "service_fm6jzqn"; 
const EMAILJS_TEMPLATE_ID = "template_63qq8aj";
const EMAILJS_PUBLIC_KEY = "JRZlYnM7gukOpjDw9"; // Public Key

// 3. 管理者のメールアドレス (このアドレスでログインすると管理画面が見れます)
const ADMIN_EMAIL = "admin@studio.com";

// ====================================================================

// Initialize Firebase
// Note: Using a fixed appId 'studio-booking-v1' to prevent path errors with environment variables containing slashes.
const configToUse = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : firebaseConfig;
const app = initializeApp(configToUse);
const auth = getAuth(app);
const db = getFirestore(app);
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

const getJSTDate = (date = new Date()) => {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
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
  console.log(`[EmailJS Process] Sending email to ${userEmail}...`);
  
  if (EMAILJS_PUBLIC_KEY === "user_xxxxx" || !EMAILJS_PUBLIC_KEY) {
    console.warn("EmailJS is not configured correctly.");
    return;
  }

  try {
    const templateParams = {
      to_email: userEmail,
      to_name: userName,
      message: bookingDetails.map(b => `${b.dateKey} ${b.timeLabel} Studio${b.studioName}`).join('\n'),
    };
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, EMAILJS_PUBLIC_KEY);
    console.log("Email sent request completed.");
  } catch (error) {
    console.error("Email send failed:", error);
  }
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
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = 'メールアドレスまたはパスワードが間違っています。';
      if (err.code === 'auth/user-not-found') msg = 'ユーザーが見つかりません。';
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
          <div><label className="block text-gray-400 text-xs mb-1">メールアドレス *</label><input required name="email" type="email" className="w-full bg-[#0f1c2e] border border-gray-600 rounded p-2 text-white" value={formData.email} onChange={handleChange} /></div>
          
          {(mode === 'login' || mode === 'register') && (
            <div><label className="block text-gray-400 text-xs mb-1">パスワード *</label><input required name="password" type="password" className="w-full bg-[#0f1c2e] border border-gray-600 rounded p-2 text-white" value={formData.password} onChange={handleChange} /></div>
          )}

          {mode === 'register' && (
            <>
              <div><label className="block text-gray-400 text-xs mb-1">氏名（実名） *</label><input required name="name" className="w-full bg-[#0f1c2e] border border-gray-600 rounded p-2 text-white" value={formData.name} onChange={handleChange} /></div>
              <div><label className="block text-gray-400 text-xs mb-1">団体名</label><input name="groupName" className="w-full bg-[#0f1c2e] border border-gray-600 rounded p-2 text-white" value={formData.groupName} onChange={handleChange} /></div>
              <div><label className="block text-gray-400 text-xs mb-1">住所 *</label><input required name="address" className="w-full bg-[#0f1c2e] border border-gray-600 rounded p-2 text-white" value={formData.address} onChange={handleChange} /></div>
              <div><label className="block text-gray-400 text-xs mb-1">電話番号 *</label><input required name="phone" type="tel" className="w-full bg-[#0f1c2e] border border-gray-600 rounded p-2 text-white" value={formData.phone} onChange={handleChange} /></div>
              <div><label className="block text-gray-400 text-xs mb-1">ジャンル *</label>
                <select required name="genre" className="w-full bg-[#0f1c2e] border border-gray-600 rounded p-2 text-white" value={formData.genre} onChange={handleChange}>
                  <option value="">選択</option><option value="dance">ダンス</option><option value="music">音楽</option><option value="other">その他</option>
                </select>
              </div>
            </>
          )}

          <button type="submit" disabled={loading} className="w-full bg-[#38506d] hover:bg-[#4a6585] text-white py-3 rounded font-bold mt-4 disabled:opacity-50">
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : mode === 'register' ? '登録' : '送信'}
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-gray-400 space-y-2">
          {mode === 'login' && <><button onClick={() => setMode('forgot')} className="hover:text-white underline">パスワードを忘れた</button><p>新規の方は <button onClick={() => setMode('register')} className="text-blue-400 font-bold">登録</button></p></>}
          {mode === 'register' && <p>アカウントをお持ちの方は <button onClick={() => setMode('login')} className="text-blue-400 font-bold">ログイン</button></p>}
          {mode === 'forgot' && <button onClick={() => setMode('login')} className="text-blue-400 font-bold">ログインへ戻る</button>}
        </div>
      </div>
    </div>
  );
};

// 2. Static Pages
const TermsView = () => (
  <div className="max-w-4xl mx-auto p-6 text-gray-300">
    <h2 className="text-2xl font-bold text-white mb-4">利用規約</h2>
    <div className="bg-[#162438] p-6 rounded border border-gray-700 space-y-4 text-sm leading-relaxed">
      <p><strong>第1条（利用目的）</strong><br/>当スタジオは、ダンス、演劇、音楽練習等の文化活動のために提供されます。</p>
      <p><strong>第2条（利用時間）</strong><br/>利用時間は厳守してください。準備・片付けも利用時間に含まれます。</p>
      <p><strong>第3条（キャンセル規定）</strong><br/>利用日の3日前までのキャンセルは無料です。それ以降のキャンセルは、システム上からは行えず、お電話にてご連絡いただき、規定のキャンセル料をお支払いいただきます。</p>
      <p><strong>第4条（禁止事項）</strong><br/>喫煙、飲酒、火気の使用、騒音による近隣への迷惑行為は固く禁じます。</p>
      <p><strong>第5条（免責）</strong><br/>スタジオ内でのお客様の貴重品の紛失・盗難等については、当方は一切の責任を負いません。</p>
    </div>
  </div>
);

const PrivacyView = () => (
  <div className="max-w-4xl mx-auto p-6 text-gray-300">
    <h2 className="text-2xl font-bold text-white mb-4">プライバシーポリシー</h2>
    <div className="bg-[#162438] p-6 rounded border border-gray-700 space-y-4 text-sm leading-relaxed">
      <p><strong>1. 個人情報の収集</strong><br/>当サイトでは、予約に必要な氏名、電話番号、メールアドレス等の個人情報を収集します。</p>
      <p><strong>2. 利用目的</strong><br/>収集した個人情報は、予約管理、緊急時の連絡、サービスの向上のために利用します。</p>
      <p><strong>3. 第三者への提供</strong><br/>法令に基づく場合を除き、利用者の同意なく第三者に個人情報を提供することはありません。</p>
      <p><strong>4. 情報の管理</strong><br/>お客様の個人情報は、漏洩・紛失防止のため、適切なセキュリティ対策を講じて管理します。</p>
    </div>
  </div>
);

// 3. Admin Dashboard
const AdminDashboard = ({ bookings, onDelete }) => {
  const [filterDate, setFilterDate] = useState('');
  const filteredBookings = bookings.filter(b => !filterDate || b.dateKey === filterDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-white"><Settings /> 管理者ダッシュボード</h2>
        <input type="date" className="bg-[#162438] border border-gray-600 rounded p-2 text-white" onChange={(e) => setFilterDate(e.target.value)}/>
      </div>
      <div className="bg-[#162438] rounded border border-gray-700 overflow-hidden">
        <table className="w-full text-sm text-left text-gray-300">
          <thead className="bg-[#0f1c2e] text-gray-100 uppercase">
            <tr><th className="px-4 py-3">日付</th><th className="px-4 py-3">時間</th><th className="px-4 py-3">スタジオ</th><th className="px-4 py-3">利用者</th><th className="px-4 py-3">操作</th></tr>
          </thead>
          <tbody>
            {filteredBookings.length === 0 ? (
              <tr><td colSpan="5" className="p-8 text-center">予約はありません</td></tr>
            ) : (
              filteredBookings.map((b) => (
                <tr key={b.id} className="border-b border-gray-700 hover:bg-[#1a2b42]">
                  <td className="px-4 py-3">{b.dateKey}</td><td className="px-4 py-3">{b.timeLabel}</td><td className="px-4 py-3 font-bold">{b.studioName}</td>
                  <td className="px-4 py-3">{b.userName}<br/><span className="text-xs text-gray-500">{b.userEmail}</span></td>
                  <td className="px-4 py-3"><button onClick={() => onDelete(b)} className="text-red-400 border border-red-900 px-2 py-1 rounded text-xs hover:bg-red-900/30">強制削除</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [view, setView] = useState('booking'); // booking, mypage, admin, terms, privacy
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [existingBookings, setExistingBookings] = useState([]);
  
  const initialDate = useMemo(() => getJSTDate(), []);
  const [viewDate, setViewDate] = useState(new Date(initialDate));
  const [selectedDate, setSelectedDate] = useState(new Date(initialDate));
  const [selections, setSelections] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate calendar days at the top level to avoid Hook errors
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1);
    const offset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const days = Array(offset).fill(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    while (days.length < 42) days.push(null);
    return days;
  }, [viewDate]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const docSnap = await getDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid));
        if (docSnap.exists()) setUserData(docSnap.data());
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try {
          await signInWithCustomToken(auth, __initial_auth_token);
        } catch (e) {
          console.error("Custom token auth failed", e);
        }
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookings = [];
      snapshot.forEach((doc) => bookings.push({ id: doc.id, ...doc.data() }));
      setExistingBookings(bookings);
    });
    return () => unsubscribe();
  }, [user]);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const isSlotBooked = (dateStr, studioId, slotId) => {
    return existingBookings.some(b => b.dateKey === dateStr && b.studioId === studioId && b.slotId === slotId);
  };

  const handleBookingSubmit = async () => {
    if (!user) return;
    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        for (const item of selections) {
          const docId = `${item.dateKey}_${item.studio.id}_${item.slot.id}`;
          const bookingRef = doc(db, 'artifacts', appId, 'public', 'data', 'bookings', docId);
          const sfDoc = await transaction.get(bookingRef);
          if (sfDoc.exists()) throw new Error(`Studio ${item.studio.name} at ${item.slot.label} is already booked!`);
          
          transaction.set(bookingRef, {
            dateKey: item.dateKey,
            studioId: item.studio.id,
            slotId: item.slot.id,
            studioName: item.studio.name,
            timeLabel: item.slot.label,
            price: item.price,
            userId: user.uid,
            userName: userData?.name || user.displayName || 'Unknown',
            userEmail: user.email,
            status: 'confirmed',
            createdAt: new Date().toISOString()
          });
        }
      });
      await sendEmailNotification(user.email, userData?.name, selections);
      setSelections([]);
      setIsModalOpen(false);
      alert('予約が完了しました！確認メールを送信しました。');
    } catch (e) {
      console.error("Booking failed", e);
      alert('予約に失敗しました。既に他の方が予約された可能性があります。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async (booking) => {
    if (!isCancellable(booking.dateKey)) {
      alert('利用日3日前を過ぎているため、システムからのキャンセルはできません。お電話にてご連絡ください。');
      return;
    }
    if (!window.confirm('予約をキャンセルしますか？')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', booking.id));
      alert('予約をキャンセルしました。');
    } catch (e) {
      alert('キャンセル失敗: ' + e.message);
    }
  };

  const handleAdminDelete = async (booking) => {
    if (!window.confirm('管理者権限で強制削除します。よろしいですか？')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', booking.id));
    } catch (e) {
      alert('削除失敗: ' + e.message);
    }
  };

  const toggleSlot = (studio, slot) => {
    const dateKey = formatDateKey(selectedDate);
    if (isSlotBooked(dateKey, studio.id, slot.id)) return;
    const uniqueId = `${dateKey}-${studio.id}-${slot.id}`;
    const exists = selections.find(s => s.uniqueId === uniqueId);
    if (exists) {
      setSelections(selections.filter(s => s.uniqueId !== uniqueId));
    } else {
      setSelections([...selections, { uniqueId, dateKey, date: new Date(selectedDate), studio, slot, price: studio.price }]);
    }
  };

  const renderBookingView = () => {
    const minDate = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
    const maxDate = new Date(initialDate.getFullYear(), initialDate.getMonth() + 6, 1);
    const totalPrice = selections.reduce((acc, curr) => acc + curr.price, 0);
    
    return (
      <div className="max-w-4xl mx-auto px-2 md:px-4 pt-6 pb-20">
        {!IS_BOOKING_ENABLED && (
          <div className="bg-yellow-900/30 border border-yellow-600 text-yellow-200 p-4 rounded mb-6 text-center text-sm">
            ただいまプレオープン準備中です。予約ボタンは無効化されています。
          </div>
        )}
        
        <div className="text-xs text-gray-300 mb-6 bg-[#162438] p-4 rounded border border-gray-700/50">
          カレンダーから日付を選び、希望のスタジオ・時間枠を選択してください。
        </div>

        <div className="flex items-center justify-center gap-6 mb-4">
          <button onClick={() => viewDate > minDate && setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} disabled={!(viewDate > minDate)} className="px-4 py-2 rounded bg-gray-800 text-white disabled:opacity-50">前の月</button>
          <h2 className="text-xl font-bold">{formatMonthYear(viewDate)}</h2>
          <button onClick={() => viewDate < maxDate && setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} disabled={!(viewDate < maxDate)} className="px-4 py-2 rounded bg-gray-800 text-white disabled:opacity-50">次の月</button>
        </div>

        <div className="bg-[#111d2e] rounded-lg overflow-hidden border border-gray-800 mb-10 max-w-lg mx-auto">
          <div className="grid grid-cols-7 bg-[#1a2b42] border-b border-gray-800 text-center font-bold text-sm">
            {WEEKDAYS.map((d,i) => <div key={i} className={`py-3 ${i===5?'text-[#4fc3f7]':i===6?'text-[#e59400]':'text-gray-200'}`}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 bg-[#0e1929]">
            {calendarDays.map((d,i) => {
              if(!d) return <div key={i} className="h-14 border border-gray-800/30"></div>;
              const isSel = isSameDay(d, selectedDate);
              const hasSel = selections.some(s => s.dateKey === formatDateKey(d));
              return (
                <div key={i} className="relative border border-gray-800/30 h-14 p-1">
                  <button onClick={() => setSelectedDate(d)} className={`w-full h-full rounded flex items-center justify-center ${isSel ? 'bg-white/20 ring-1 ring-white' : 'hover:bg-white/5'} ${hasSel ? 'border border-white/40 bg-white/10' : ''}`}>
                    <span className={`text-sm ${d.getDay()===6?'text-[#4fc3f7]':d.getDay()===0?'text-[#e59400]':'text-gray-300'} ${hasSel ? 'font-bold text-white' : ''}`}>{d.getDate()}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto mb-20">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-5 gap-2 mb-2 text-center text-sm font-bold text-gray-900">
              {STUDIOS.map(s => <div key={s.id} style={{backgroundColor:s.color}} className="py-2 rounded-t">{s.id} <span className="text-xs block">¥{s.price}</span></div>)}
            </div>
            <div className="space-y-2">
              {TIME_SLOTS.map(slot => (
                <div key={slot.id} className="grid grid-cols-5 gap-2">
                  {STUDIOS.map(studio => {
                    const dk = formatDateKey(selectedDate);
                    const booked = isSlotBooked(dk, studio.id, slot.id);
                    const selected = selections.some(s => s.uniqueId === `${dk}-${studio.id}-${slot.id}`);
                    return (
                      <button key={studio.id} onClick={() => toggleSlot(studio, slot)} disabled={booked}
                        className={`py-2 rounded flex flex-col items-center justify-center transition-all ${booked ? 'bg-gray-800 opacity-40 cursor-not-allowed' : selected ? 'scale-95 ring-2 ring-white z-10' : 'hover:brightness-110'}`}
                        style={{backgroundColor: booked ? undefined : (selected ? 'white' : studio.color)}}
                      >
                        <span className={`text-[10px] font-bold ${selected ? 'text-black' : 'text-gray-900'}`}>{booked ? '✕' : slot.label}</span>
                        {selected && <Check size={12} className="text-green-600" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {selections.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-[#162438]/95 border-t border-gray-700 p-4 flex justify-between items-center z-50">
            <div>
              <span className="text-gray-400 text-xs">選択中: {selections.length}件 | 合計:</span>
              <span className="font-bold text-2xl ml-2 text-white">¥{totalPrice.toLocaleString()}</span>
            </div>
            <button 
              onClick={() => {
                if (IS_BOOKING_ENABLED) setIsModalOpen(true);
                else alert("ただいまプレオープン準備中です。予約受付開始まで今しばらくお待ちください。");
              }} 
              className={`px-6 py-3 rounded font-bold shadow-lg ${IS_BOOKING_ENABLED ? 'bg-[#38506d] hover:bg-[#4a6585] text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
            >
              {IS_BOOKING_ENABLED ? '予約へ進む' : '受付準備中'}
            </button>
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
            <div className="bg-[#162438] w-full max-w-2xl rounded-lg border border-gray-700 flex flex-col max-h-[90vh]">
              <div className="p-4 border-b border-gray-700 font-bold text-white">予約確認</div>
              <div className="p-6 overflow-y-auto flex-1 space-y-4 text-sm text-gray-300">
                <div className="bg-blue-900/20 p-4 rounded border border-blue-900/50">
                  <h4 className="font-bold text-blue-300 mb-1">お支払い</h4>
                  <p>当日、受付にて現金またはPayPayでお支払いください。</p>
                </div>
                <div className="space-y-1">
                  {selections.map(s => <div key={s.uniqueId} className="flex justify-between border-b border-gray-700 pb-1"><span>{s.dateKey} {s.slot.label} - Studio {s.studio.name}</span><span>¥{s.price}</span></div>)}
                  <div className="text-right font-bold text-lg pt-2 text-white">合計: ¥{totalPrice.toLocaleString()}</div>
                </div>
              </div>
              <div className="p-4 border-t border-gray-700 flex gap-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 rounded bg-gray-700 text-white hover:bg-gray-600">戻る</button>
                <button onClick={handleBookingSubmit} disabled={isProcessing} className="flex-1 py-3 rounded bg-blue-600 font-bold text-white hover:bg-blue-500">{isProcessing ? '処理中...' : '確定する'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMyPage = () => {
    const myBookings = existingBookings.filter(b => b.userId === user.uid).sort((a,b) => a.dateKey.localeCompare(b.dateKey));
    return (
      <div className="max-w-4xl mx-auto p-4 pt-6">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-white"><User className="text-blue-400"/> マイページ</h2>
        <div className="bg-[#162438] rounded border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 font-bold bg-[#1a2b42] text-white">予約一覧</div>
          <div className="divide-y divide-gray-700">
            {myBookings.length === 0 ? <div className="p-8 text-center text-gray-500">予約はありません</div> : myBookings.map(b => (
              <div key={b.id} className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white">{b.dateKey}</div>
                  <div className="text-sm text-gray-300">{b.timeLabel} Studio {b.studioName}</div>
                  <div className="text-xs text-gray-500">¥{b.price.toLocaleString()}</div>
                </div>
                <button onClick={() => handleCancel(b)} disabled={!isCancellable(b.dateKey)} className={`px-3 py-1 rounded text-xs border flex items-center gap-1 ${isCancellable(b.dateKey) ? 'border-red-500 text-red-400 hover:bg-red-500/10' : 'border-gray-600 text-gray-500 cursor-not-allowed'}`}>
                  <Trash2 size={14}/> {isCancellable(b.dateKey) ? 'キャンセル' : '電話のみ'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loadingAuth) return <div className="min-h-screen bg-[#0f1c2e] flex items-center justify-center text-white">Loading...</div>;
  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen bg-[#0f1c2e] text-white font-sans flex flex-col">
      <header className="bg-[#162438] border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-lg font-bold cursor-pointer" onClick={() => setView('booking')}>神戸芸術センター・スタジオ予約</h1>
          <div className="flex items-center gap-3">
            {isAdmin && <button onClick={() => setView('admin')} className="p-2 rounded hover:bg-white/10 text-gray-300 hover:text-white" title="管理者画面"><Settings size={20}/></button>}
            <button onClick={() => setView(view === 'booking' ? 'mypage' : 'booking')} className="bg-[#23354d] hover:bg-[#304661] px-3 py-2 rounded text-sm flex gap-2 items-center transition-colors">
              {view === 'booking' ? <><User size={16}/> マイページ</> : <><Calendar size={16}/> 予約</>}
            </button>
            <button onClick={() => signOut(auth)} className="text-gray-400 hover:text-red-400 p-2 rounded hover:bg-white/5 transition-colors" title="ログアウト"><LogOut size={20}/></button>
          </div>
        </div>
      </header>
      <main className="flex-grow">
        {view === 'booking' && renderBookingView()}
        {view === 'mypage' && renderMyPage()}
        {view === 'admin' && isAdmin && <AdminDashboard bookings={existingBookings} onDelete={handleAdminDelete} />}
        {view === 'terms' && <TermsView />}
        {view === 'privacy' && <PrivacyView />}
      </main>
      <footer className="py-8 text-center text-xs text-gray-500 border-t border-gray-800 bg-[#0f1c2e]">
        <div className="mb-2">
          <button onClick={() => setView('terms')} className="hover:text-white mr-4 transition-colors">利用規約</button>
          <button onClick={() => setView('privacy')} className="hover:text-white transition-colors">プライバシーポリシー</button>
        </div>
        <p>&copy; 2025 Kobe Art Center Studio Booking</p>
      </footer>
    </div>
  );
}