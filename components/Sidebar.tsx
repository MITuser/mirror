import React, { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import styles from '@/styles/Sidebar.module.css';

type ChatSession = {
    _id: string;
    sessionID: string;
    name: string;
};
type SidebarProps = {
  className?: any;
  onSessionChange?: (sessionId: string) => void;  // Updated the type
  sessions?: ChatSession[];
};

const Sidebar: React.FC<SidebarProps> = ({ className, onSessionChange, sessions }) => {
  // Use ChatSession type for chatSessions state
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(sessions || []);
  const [currentSessionID, setCurrentSessionID] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sapp');
    }
    return null;
  });
  console.log("Received className in sidebar", className);
  useEffect(() => {
    async function fetchChatSessions() {
      try {
        const response = await fetch('/api/fetchAllSessions', { // Updated endpoint
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userID: localStorage.getItem('lapp'),
            course: className,
          }),
        });
        const data = await response.json();
        setChatSessions(data.sessions || []);
      } catch (error) {
        console.error('Failed to fetch chat sessions:', error);
      }
    }
 
    // Fetch sessions if no sessions prop is provided or if currentSessionID changes
    if (!sessions || currentSessionID) {
      fetchChatSessions();
    }
  }, [currentSessionID, sessions]);

  const handleNewChat = async () => {
    const newSessionID = uuidv4();
    try {
      await fetch('/api/createNewChatSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userID: localStorage.getItem('lapp'),
          sessionID: newSessionID,
          course: className,
        }),
      });
      localStorage.setItem('sapp', newSessionID);
      setCurrentSessionID(newSessionID);
      setChatSessions(prevSessions => [...prevSessions, { _id: newSessionID, sessionID: newSessionID, name: "Default Name" }]);
    } catch (error) {
      console.error('Failed to create new chat session:', error);
    }
  }

  return (
    <div className={styles.side}>
      <button onClick={handleNewChat} className={styles.newChatButton}>+  New Chat</button>
      {chatSessions.map(session => (
    <button
      key={session._id}
      onClick={() => {
        localStorage.setItem('sapp', session.sessionID);
        setCurrentSessionID(session.sessionID); 
        if (onSessionChange) {
          onSessionChange(session.sessionID); 
        }
      }}
      className={styles.sessionButton}>
    {session.name}
  </button>
    ))}
  </div>
);
}
export default Sidebar;