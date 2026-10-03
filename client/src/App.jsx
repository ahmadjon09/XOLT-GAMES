// App - router va himoyalangan sahifalar
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { PageLoader } from './components/ui.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import OAuthCallback from './pages/OAuthCallback.jsx';

import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import { StudentLayout } from './layouts/Layouts.jsx';
import { StaffLayout } from './layouts/Layouts.jsx';
import Home from './pages/student/Home.jsx';
import Shop from './pages/student/Shop.jsx';
import Leaderboard from './pages/student/Leaderboard.jsx';
import Profile from './pages/student/Profile.jsx';
import PublicProfile from './pages/student/PublicProfile.jsx';
import Friends from './pages/student/Friends.jsx';
import Quizzes from './pages/staff/Quizzes.jsx';
import QuizEditor from './pages/staff/QuizEditor.jsx';
import Lobby from './pages/student/Lobby.jsx';
import MathGame from './pages/games/MathGame.jsx';
import TicTacToe from './pages/games/TicTacToe.jsx';
import QuizPlay from './pages/games/QuizPlay.jsx';
import TypeRacing from './pages/games/TypeRacing.jsx';
import CodeBattle from './pages/games/CodeBattle.jsx';
import Chess from './pages/games/Chess.jsx';
import Checkers from './pages/games/Checkers.jsx';
import { TypingTexts, CodeQuestions } from './pages/staff/GameContent.jsx';

import StaffHome from './pages/staff/StaffHome.jsx';
import QuizHost from './pages/staff/QuizHost.jsx';
import AdminDashboard from './pages/staff/AdminDashboard.jsx';
import AdminGames from './pages/staff/AdminGames.jsx';
import AdminUsers from './pages/staff/AdminUsers.jsx';
import UserDetails from './pages/staff/UserDetails.jsx';
import AdminShop from './pages/staff/AdminShop.jsx';
import StaffProfile from './pages/staff/StaffProfile.jsx';

// Sahifani himoya qiluvchi wrapper
function Guard({ children, kind, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PageLoader />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (kind && user.kind !== kind) return <Navigate to={user.kind === 'staff' ? '/staff' : '/'} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.kind === 'staff' ? '/staff' : '/'} replace />;

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* PWA: ilova ornatilmagan bo'lsa chekadan "O'rnatib oling" banneri */}
      <InstallPrompt />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<OAuthCallback />} />

        {/* O'quvchi sahifalari */}
        <Route
          element={
            <Guard kind="user">
              <StudentLayout />
            </Guard>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/quizzes" element={<Quizzes />} />
          <Route path="/quizzes/new" element={<QuizEditor />} />
          <Route path="/quizzes/:id/edit" element={<QuizEditor />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/players/:id" element={<PublicProfile />} />
        </Route>

        {/* O'yinlar (o'quvchilar uchun, lekin login kerak) */}
        <Route
          path="/game/math"
          element={
            <Guard kind="user">
              <MathGame />
            </Guard>
          }
        />
        <Route
          path="/game/ttt"
          element={
            <Guard kind="user">
              <TicTacToe />
            </Guard>
          }
        />
        <Route
          path="/quiz/play"
          element={
            <Guard kind="user">
              <QuizPlay />
            </Guard>
          }
        />
        <Route path="/quiz/join" element={<Navigate to="/quiz/play" replace />} />
        <Route path="/quiz/host" element={<Guard kind="user"><QuizHost /></Guard>} />
        <Route
          path="/game/typerace"
          element={
            <Guard kind="user">
              <TypeRacing />
            </Guard>
          }
        />
        <Route
          path="/game/codebattle"
          element={
            <Guard kind="user">
              <CodeBattle />
            </Guard>
          }
        />
        <Route
          path="/game/chess"
          element={
            <Guard kind="user">
              <Chess />
            </Guard>
          }
        />
        <Route
          path="/game/checkers"
          element={
            <Guard kind="user">
              <Checkers />
            </Guard>
          }
        />
        {/* Xodim sahifalari */}
        <Route
          element={
            <Guard kind="staff">
              <StaffLayout />
            </Guard>
          }
        >
          <Route path="/staff" element={<StaffHome />} />
          <Route path="/staff/profile" element={<StaffProfile />} />
          <Route path="/staff/users" element={<Guard roles={['ADMIN']}><AdminUsers /></Guard>} />
          <Route path="/staff/users/:id" element={<Guard roles={['ADMIN']}><UserDetails /></Guard>} />
          <Route path="/staff/shop" element={<Guard roles={['ADMIN']}><AdminShop /></Guard>} />
          <Route path="/staff/games" element={<Guard roles={['ADMIN']}><AdminGames /></Guard>} />
          <Route path="/staff/typing-texts" element={<Guard roles={['ADMIN']}><TypingTexts /></Guard>} />
          <Route path="/staff/code-questions" element={<Guard roles={['ADMIN']}><CodeQuestions /></Guard>} />
          <Route path="/staff/stats" element={<Guard roles={['ADMIN']}><AdminDashboard /></Guard>} />
        </Route>

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
