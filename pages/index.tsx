import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from '@/styles/HomePage.module.css';
import useTypewriter from 'react-typewriter-hook'; // You need to install this package

const HomePage: React.FC = () => {
  const [magicName, setMagicName] = useState("Explain lecture 21 in detail");
  const typewriter = useTypewriter(magicName);
  const index = useRef(0);
  const prompts = [
    "How much weight is the final?",
    "CS 3110: explain OCaml code from chapter..",
    "When is the next prelim?",
    "CHEM 2090: explain the second lab",
    "What diversity classes should I take?",
    "Generate practice prelim problems",
    "INFO 2950: explain main concepts from lecture 13",
    "Explain how to do problem 1 from HW2",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      index.current = index.current >= prompts.length - 1 ? 0 : index.current + 1;
      setMagicName(prompts[index.current]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);


  

  return (
    <div className={styles.container}>
      <div className={styles.typewriterContainer}>
        <div className={styles.typewriter}>
          {typewriter}
        </div>
      </div>

      <div className={styles.buttonContainer}>
        <h1 className={styles.title}>
          <span style={{ color: 'hsl(0, 100%, 30%)' }}>Cornell</span>
          <span style={{ color: 'hsl(0, 100%, 30%)' }}>GPT BETA</span>
        </h1>
        
        <Link href="/sign-up" passHref>
          <button className={styles.button}>
            <span>🐻</span>Sign Up
          </button>
        </Link>

        <Link href="/loginEmail" passHref>
          <button className={styles.loginButton}>
            <span>🐻</span>Log In
          </button>
        </Link>
      </div>
      <footer className={styles.footer}>
        <a href="/terms-of-use" className={styles.footerLink}>Terms of Use</a> | 
        <a href="/privacy-policy" className={styles.footerLink}>Privacy Policy</a>
        </footer>
    </div>
  );
}



export default HomePage;








