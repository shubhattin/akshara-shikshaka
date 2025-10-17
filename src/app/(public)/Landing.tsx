'use client';

import { motion } from 'framer-motion';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import Link from 'next/link';
import { FaBookOpen, FaVolumeUp, FaRegHandPaper, FaPencilAlt } from 'react-icons/fa';
import { IoLanguage } from 'react-icons/io5';
import { MdRecordVoiceOver, MdDraw } from 'react-icons/md';
import { BsStars } from 'react-icons/bs';
import { lazy, Suspense } from 'react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0
  }
};

const ManageMenuList = lazy(() => import('./ManageMenuList'));

export default function Home() {
  const StartLearningButton = (
    <Button
      size="lg"
      className="bg-gradient-to-r from-amber-500 to-orange-500 text-lg font-semibold text-white shadow-lg hover:from-amber-600 hover:to-orange-600"
      asChild
    >
      <Link href="/lessons">
        <FaBookOpen className="mr-2" />
        Start Learning
      </Link>
    </Button>
  );

  return (
    <div className="min-h-screen overflow-hidden">
      {/* Hero Section */}
      <section className="relative px-4 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="mb-5 inline-block"
            >
              <BsStars className="mx-auto text-5xl text-amber-500 md:text-6xl" />
            </motion.div>

            <h1 className="mb-5 bg-gradient-to-r from-amber-600 via-orange-500 to-rose-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl lg:text-6xl">
              Learn Scripts, The Interactive Way
            </h1>

            <p className="mx-auto mb-6 max-w-2xl text-base text-slate-600 md:text-lg dark:text-slate-300">
              Master{' '}
              <span className="font-semibold text-amber-600 dark:text-amber-400">Sanskrit</span> and
              Indian scripts through an immersive, hands-on experience. Write, practice, and perfect
              your skills in{' '}
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                Devanagari, Telugu, Kannada, Malayalam
              </span>
              , and more—with guided gestures, authentic pronunciations, and real-time feedback.
            </p>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="flex flex-wrap justify-center gap-4"
            >
              <Suspense fallback={StartLearningButton}>
                <ManageMenuList>{StartLearningButton}</ManageMenuList>
              </Suspense>
            </motion.div>
          </motion.div>
        </div>

        <div className="select-none">
          {/* Decorative Floating Characters */}
          <motion.div
            animate={{ y: [-6, 6, -6] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-12 left-6 hidden text-4xl opacity-20 md:block lg:left-10"
          >
            अ
          </motion.div>

          <motion.div
            animate={{ y: [-6, 6, -6] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
            className="absolute top-20 right-6 hidden text-4xl opacity-20 md:block lg:right-12"
          >
            క
          </motion.div>

          {/* <motion.div
            animate={{ y: [-6, 6, -6] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
            className="absolute top-32 left-1/2 hidden -translate-x-1/2 text-4xl opacity-20 md:block"
          >
            অ
          </motion.div> */}

          {/* Additional floats for larger screens (kept subtle) */}
          <motion.div
            animate={{ y: [-6, 6, -6] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 2.4 }}
            className="absolute right-10 bottom-20 hidden text-4xl opacity-16 lg:block"
          >
            ଅ
          </motion.div>

          <motion.div
            animate={{ y: [-6, 6, -6] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
            className="absolute bottom-12 left-20 hidden text-4xl opacity-16 lg:block"
          >
            અ
          </motion.div>

          <motion.div
            animate={{ y: [-6, 6, -6] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            className="absolute top-8 right-1/4 hidden text-4xl opacity-16 lg:block"
          >
            அ
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-gradient-to-b from-slate-50 to-white px-4 py-12 md:py-16 dark:from-slate-900 dark:to-slate-800">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-12 text-center"
          >
            <h2 className="mb-4 text-3xl font-bold text-slate-800 md:text-4xl dark:text-slate-100">
              Immersive Learning Features
            </h2>
            <p className="mx-auto max-w-2xl text-slate-600 dark:text-slate-300">
              Everything you need to confidently learn, practice, and master multiple scripts
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {/* Feature Card 1 */}
            <motion.div variants={itemVariants} transition={{ duration: 0.5 }}>
              <Card className="group h-full border-2 border-slate-200 bg-white p-6 transition-all hover:border-emerald-400 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg">
                  <MdDraw className="text-2xl" />
                </div>
                <h3 className="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-100">
                  Learn by Drawing
                </h3>
                <p className="text-slate-600 dark:text-slate-300">
                  Practice writing letters and words with guided hand gestures. Get instant feedback
                  on stroke order and form.
                </p>
              </Card>
            </motion.div>

            {/* Feature Card 2 */}
            <motion.div variants={itemVariants} transition={{ duration: 0.5 }}>
              <Card className="group h-full border-2 border-slate-200 bg-white p-6 transition-all hover:border-rose-400 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-lg">
                  <MdRecordVoiceOver className="text-2xl" />
                </div>
                <h3 className="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-100">
                  Learn How to Say It
                </h3>
                <p className="text-slate-600 dark:text-slate-300">
                  Hear native pronunciations for individual letters (varnas) and complete words.
                  Perfect your accent naturally.
                </p>
              </Card>
            </motion.div>

            {/* Feature Card 3 */}
            <motion.div variants={itemVariants} transition={{ duration: 0.5 }}>
              <Card className="group h-full border-2 border-slate-200 bg-white p-6 transition-all hover:border-amber-400 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-lg">
                  <IoLanguage className="text-2xl" />
                </div>
                <h3 className="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-100">
                  One Language, Many Ways
                </h3>
                <p className="text-slate-600 dark:text-slate-300">
                  Learn Sanskrit in Devanagari, Telugu, Kannada, Malayalam, Tamil, and more. Switch
                  between scripts effortlessly.
                </p>
              </Card>
            </motion.div>

            {/* Feature Card 4 */}
            <motion.div variants={itemVariants} transition={{ duration: 0.5 }}>
              <Card className="group h-full border-2 border-slate-200 bg-white p-6 transition-all hover:border-purple-400 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-purple-400 to-indigo-500 text-white shadow-lg">
                  <FaBookOpen className="text-2xl" />
                </div>
                <h3 className="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-100">
                  Guided Learning Path
                </h3>
                <p className="text-slate-600 dark:text-slate-300">
                  Follow a progressive curriculum that takes you from basics to proficiency at your
                  own pace.
                </p>
              </Card>
            </motion.div>

            {/* Feature Card 5 */}
            <motion.div variants={itemVariants} transition={{ duration: 0.5 }}>
              <Card className="group h-full border-2 border-slate-200 bg-white p-6 transition-all hover:border-cyan-400 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-lg">
                  <FaVolumeUp className="text-2xl" />
                </div>
                <h3 className="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-100">
                  Sound Learning
                </h3>
                <p className="text-slate-600 dark:text-slate-300">
                  High-quality audio guides you through proper pronunciation, intonation, and
                  natural speech patterns.
                </p>
              </Card>
            </motion.div>

            {/* Feature Card 6 */}
            <motion.div variants={itemVariants} transition={{ duration: 0.5 }}>
              <Card className="group h-full border-2 border-slate-200 bg-white p-6 transition-all hover:border-orange-400 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-lg">
                  <FaPencilAlt className="text-2xl" />
                </div>
                <h3 className="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-100">
                  Hands-On Practice
                </h3>
                <p className="text-slate-600 dark:text-slate-300">
                  Practice with real-time feedback. Draw letters, check your work, and improve
                  instantly.
                </p>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Script Showcase Section */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-12 text-center"
          >
            <h2 className="mb-4 text-3xl font-bold text-slate-800 md:text-4xl dark:text-slate-100">
              Sanskrit in Multiple Scripts
            </h2>
            <p className="mx-auto max-w-2xl text-slate-600 dark:text-slate-300">
              See how the same Sanskrit text looks beautifully written in different Indian scripts.
              Learn the script that matters to you.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-white via-amber-50 to-orange-50 p-8 shadow-2xl md:p-12 dark:border-slate-700 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900"
          >
            <div className="grid gap-8 md:grid-cols-2">
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="rounded-xl bg-white p-6 shadow-lg dark:bg-slate-800"
              >
                <h3 className="mb-2 text-sm font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400">
                  Devanagari
                </h3>
                <p className="text-3xl font-bold text-slate-800 md:text-4xl dark:text-slate-100">
                  संस्कृतम्
                </p>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="rounded-xl bg-white p-6 shadow-lg dark:bg-slate-800"
              >
                <h3 className="mb-2 text-sm font-semibold tracking-wide text-orange-600 uppercase dark:text-orange-400">
                  Telugu
                </h3>
                <p className="text-3xl font-bold text-slate-800 md:text-4xl dark:text-slate-100">
                  సంస్కృతం
                </p>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="rounded-xl bg-white p-6 shadow-lg dark:bg-slate-800"
              >
                <h3 className="mb-2 text-sm font-semibold tracking-wide text-rose-600 uppercase dark:text-rose-400">
                  Kannada
                </h3>
                <p className="text-3xl font-bold text-slate-800 md:text-4xl dark:text-slate-100">
                  ಸಂಸ್ಕೃತಂ
                </p>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="rounded-xl bg-white p-6 shadow-lg dark:bg-slate-800"
              >
                <h3 className="mb-2 text-sm font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                  Malayalam
                </h3>
                <p className="text-3xl font-bold text-slate-800 md:text-4xl dark:text-slate-100">
                  സംസ്കൃതം
                </p>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="mt-8 text-center"
            >
              <p className="text-slate-600 dark:text-slate-300">
                ...and many more scripts including Tamil, Bengali, Gujarati, Odia, and more!
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl">
              Start Your Script Learning Journey Today
            </h2>
            <p className="mb-8 text-lg text-white/90 md:text-xl">
              Learn Sanskrit and Indian scripts in an interactive, engaging way designed for modern
              learners
            </p>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                className="bg-white text-lg font-semibold text-orange-600 shadow-xl hover:bg-slate-50"
                asChild
              >
                <Link href="/lessons">
                  <FaBookOpen className="mr-2" />
                  Get Started Now
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer Section */}
      <section className="bg-slate-100 px-4 py-12 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl text-center">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-slate-600 dark:text-slate-400">
              Making Sanskrit and Indian scripts accessible to everyone through immersive,
              interactive learning
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
