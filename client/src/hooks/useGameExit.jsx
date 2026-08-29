// useGameExit — barcha o'yin sahifalari uchun YAGONA oson chiqish tizimi
// Muammo: bolalar o'yindan chiqishda qiynalardi — brauzer "back" bosilganda
// sahifa ketardi, lekin server o'yinni "aktiv" deb saqlab qolardi va keyin
// "Siz allaqachon aktiv o'yindasiz" xatosi chiqardi.
//
// Yechim:
//  1) TopBar'dagi "orqaga" tugmasi — aktiv o'yinda tasdiq so'raydi, keyin
//     serverga leave yuborib, bosh sahifaga qaytaradi
//  2) Brauzer/Android "back" (router -1) — aktiv o'yinda ushlanadi:
//     tasdiq dialogi chiqadi (tasodifiy yutqazishdan saqlaydi)
//  3) Har qanday yo'l bilan sahifadan ketilsa (unmount) — agar o'yin
//     aktiv/kutish holatida bo'lsa, serverga avtomatik leave yuboriladi
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ui.jsx';

const GUARD_STATE = { __xoltGameGuard: true };

export function useGameExit({
  active,           // o'yin davom etyaptimi (waiting yoki active)
  leave,            // serverga leave yuboradigan + lokal holatni tozalovchi funksiya
  fallbackTo = '/', // chiqqandan keyin qayerga o'tish
  exitTitle,        // dialog sarlavhasi (tarjima)
  exitMessage,      // dialog matni (tarjima)
  confirmText,      // tasdiq tugmasi matni
}) {
  const navigate = useNavigate();
  const [askOpen, setAskOpen] = useState(false);

  const activeRef = useRef(false);
  const leaveRef = useRef(leave);
  const armedRef = useRef(false);   // history guard qo'yilganmi
  const exitedRef = useRef(false);  // chiqish allaqachon bajarilgan

  leaveRef.current = leave; // har render'da eng yangisi

  useEffect(() => {
    activeRef.current = !!active;
    if (!active) setAskOpen(false);
  }, [active]);

  // ==== 2) Brauzer "back" ni ushlash ====
  // Aktiv o'yinda qo'shimcha history yozuv qo'yamiz: birinchi "back" shu
  // yozuvni yeydi — sahifa ketmaydi, biz tasdiq so'raymiz.
  useEffect(() => {
    if (active && !armedRef.current) {
      armedRef.current = true;
      try { window.history.pushState(GUARD_STATE, ''); } catch (e) { /* ignore */ }
    } else if (!active && armedRef.current && !exitedRef.current) {
      // o'yin tugadi (yoki bekor bo'ldi) — guardni jim olib tashlaymiz,
      // keyingi "back" oddiy ishlashi uchun
      armedRef.current = false;
      try { window.history.back(); } catch (e) { /* ignore */ }
    }
  }, [active]);

  useEffect(() => {
    const onPop = () => {
      if (exitedRef.current || !armedRef.current || !activeRef.current) return;
      // "back" bosildi — qolamiz va tasdiq so'raymiz
      try { window.history.pushState(GUARD_STATE, ''); } catch (e) { /* ignore */ }
      setAskOpen(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ==== 1) Aniq chiqish ====
  const doExit = useCallback(() => {
    setAskOpen(false);
    exitedRef.current = true;
    armedRef.current = false;
    try { leaveRef.current && leaveRef.current(); } catch (e) { /* ignore */ }
    navigate(fallbackTo, { replace: true });
  }, [fallbackTo, navigate]);

  // TopBar "orqaga" yoki "Chiqish" tugmalari uchun
  const requestExit = useCallback(() => {
    if (activeRef.current) setAskOpen(true);
    else doExit();
  }, [doExit]);

  // ==== 3) Unmount xavfsizlik tarmog'i ====
  // Sahifa har qanday sabab bilan yopilsa (back, boshqa sahifaga o'tish...)
  // va o'yin hali aktiv bo'lsa — serverga leave yuboramiz.
  useEffect(() => () => {
    if (exitedRef.current) return;
    if (activeRef.current) {
      try { leaveRef.current && leaveRef.current(); } catch (e) { /* ignore */ }
    }
  }, []);

  const exitDialog = (
    <ConfirmDialog
      open={askOpen}
      title={exitTitle}
      message={active ? exitMessage : undefined}
      danger
      confirmText={confirmText}
      onConfirm={doExit}
      onClose={() => setAskOpen(false)}
    />
  );

  return { requestExit, doExit, exitDialog };
}
