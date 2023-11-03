import connectToDb from '@/config/db';

export default async (req, res) => {
    const { userID, sessionID, course, name} = req.body;
  
    if (!userID || !sessionID) {
      return res.status(400).json({ error: 'userID and sessionID are required' });
    }
  
    try {
      const db = await connectToDb();
      const sessionCollection = db.collection('sessionIDs');
  
      await sessionCollection.insertOne({
        userID,
        sessionID,
        name: name || "New chat",
        date: new Date(),
        course: course,
        isEmpty: true,
      });
  
      return res.status(200).json({ success: true });
  
    } catch (error) {
      console.error('Failed to create new chat session:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
};
