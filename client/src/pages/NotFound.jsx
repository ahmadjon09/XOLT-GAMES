import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaArrowLeft, FaHome, FaQuestionCircle } from 'react-icons/fa';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.2 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const numberVariants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { delay: 0.2, duration: 0.5, type: 'spring', stiffness: 200 } },
};

export default function NotFound() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="w-full max-w-2xl">
        <div className="bg-gradient-to-br from-indigo-900 via-purple-800 to-indigo-900 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 md:p-12 text-center">
          <motion.div variants={numberVariants} className="relative mb-6">
            <h1 className="text-8xl md:text-9xl font-black text-white drop-shadow-2xl tracking-tight">404</h1>
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              className="absolute -top-4 -right-4 text-yellow-400"
            >
              <FaQuestionCircle size={48} />
            </motion.div>
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <span className="text-[15rem] md:text-[20rem] font-black text-white select-none">?</span>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="w-20 h-1 bg-gradient-to-r from-yellow-400 to-orange-500 mx-auto my-6 rounded-full" />
          <motion.h2 variants={itemVariants} className="text-2xl md:text-3xl font-bold text-white mb-3">
            {t('notFound.title')}
          </motion.h2>
          <motion.p variants={itemVariants} className="text-indigo-200 max-w-md mx-auto mb-8 text-base md:text-lg">
            {t('notFound.description')}
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all duration-200 gap-2 group"
            >
              <FaArrowLeft className="group-hover:-translate-x-1 transition-transform" />
              {t('notFound.back')}
            </button>
            <Link
              to="/"
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-indigo-900 font-semibold transition-all duration-200 gap-2 shadow-lg shadow-yellow-400/30 group"
            >
              <FaHome className="group-hover:scale-110 transition-transform" />
              {t('notFound.home')}
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
