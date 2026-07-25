"use client"

// DISABLED (out of scope for v1) — see AGENT_CONTRACT.md rule 7.
//
// This page was a direct-message inbox that called `/api/messages` with a
// hardcoded user id. That route does not exist in the App Router rebuild and
// there is no conversation model behind it, so every request 404'd and the
// screen sat on a spinner forever.
//
// Rather than ship a dead inbox, the page now states plainly that direct
// messaging is not available and points at the one private channel that IS
// live: an expert consultation (`/consultations`), whose thread is visible only
// to the farmer and the assigned adviser.
//
// The original implementation is preserved at the bottom of this file, commented
// out, so it can be restored once a real messaging API exists.

import Link from "next/link"
import { MailX, Stethoscope, Users } from "lucide-react"

import { useLanguage } from "@/lib/contexts"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function MessagesPage() {
  const { t } = useLanguage()

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold leading-[1.6] text-foreground sm:text-3xl">{t("messages.title")}</h1>

      <Card className="mt-5">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <MailX className="h-7 w-7" />
          </span>

          <h2 className="text-lg font-bold leading-[1.7] text-foreground">{t("messages.disabledTitle")}</h2>
          <p className="text-sm leading-[1.9] text-muted-foreground">{t("messages.disabledBody")}</p>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild className="min-h-tap">
              <Link href="/consultations">
                <Stethoscope className="me-2 h-4 w-4" aria-hidden />
                {t("messages.bookConsultation")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-tap">
              <Link href="/community">
                <Users className="me-2 h-4 w-4" aria-hidden />
                {t("messages.openCommunity")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ==========================================================================
   Original implementation (disabled — depends on the non-existent
   /api/messages route). Kept verbatim so it can be recovered.
   ========================================================================== */

// 'use client';
//
// import { useState, useEffect } from 'react';
// import { Send, Phone, Video, MoreVertical, Search, ArrowLeft } from 'lucide-react';
//
// export default function MessagesPage() {
//   const [conversations, setConversations] = useState([]);
//   const [selectedConversation, setSelectedConversation] = useState(null);
//   const [messages, setMessages] = useState([]);
//   const [newMessage, setNewMessage] = useState('');
//   const [loading, setLoading] = useState(true);
//   const [isMobile, setIsMobile] = useState(false);
//
//   useEffect(() => {
//     const checkMobile = () => setIsMobile(window.innerWidth < 768);
//     checkMobile();
//     window.addEventListener('resize', checkMobile);
//     return () => window.removeEventListener('resize', checkMobile);
//   }, []);
//
//   useEffect(() => {
//     fetchConversations();
//   }, []);
//
//   useEffect(() => {
//     if (selectedConversation) {
//       fetchMessages(selectedConversation._id);
//     }
//   }, [selectedConversation]);
//
//   const fetchConversations = async () => {
//     try {
//       const response = await fetch('/api/messages?userId=507f1f77bcf86cd799439011');
//       const data = await response.json();
//
//       if (data.success) {
//         setConversations(data.data);
//         if (data.data.length > 0 && !isMobile) {
//           setSelectedConversation(data.data[0]);
//         }
//       }
//     } catch (error) {
//       console.error('Error fetching conversations:', error);
//     } finally {
//       setLoading(false);
//     }
//   };
//
//   const fetchMessages = async (conversationId) => {
//     try {
//       const response = await fetch(`/api/messages?conversationId=${conversationId}`);
//       const data = await response.json();
//
//       if (data.success) {
//         setMessages(data.data.reverse());
//       }
//     } catch (error) {
//       console.error('Error fetching messages:', error);
//     }
//   };
//
//   const sendMessage = async (e) => {
//     e.preventDefault();
//     if (!newMessage.trim() || !selectedConversation) return;
//
//     try {
//       const response = await fetch('/api/messages', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           senderId: '507f1f77bcf86cd799439011',
//           conversationId: selectedConversation._id,
//           content: newMessage
//         })
//       });
//
//       const data = await response.json();
//       if (data.success) {
//         setMessages([...messages, data.data]);
//         setNewMessage('');
//       }
//     } catch (error) {
//       console.error('Error sending message:', error);
//     }
//   };
//
//   const formatTime = (date) => {
//     return new Date(date).toLocaleTimeString('en-US', {
//       hour: '2-digit',
//       minute: '2-digit'
//     });
//   };
//
//   if (loading) {
//     return (
//       <div className="min-h-screen bg-gray-50 flex items-center justify-center">
//         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
//       </div>
//     );
//   }
//
//   return (
//     <div className="min-h-screen bg-gray-50">
//       <div className="max-w-7xl mx-auto">
//         <div className="flex h-screen">
//           {/* Conversations List */}
//           <div className={`${
//             isMobile && selectedConversation ? 'hidden' : 'block'
//           } w-full md:w-1/3 bg-white border-r border-gray-200`}>
//             <div className="p-4 border-b border-gray-200">
//               <h1 className="text-xl font-bold text-gray-900 mb-4">Messages</h1>
//               <div className="relative">
//                 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
//                 <input
//                   type="text"
//                   placeholder="Search conversations..."
//                   className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
//                 />
//               </div>
//             </div>
//
//             <div className="overflow-y-auto h-full">
//               {conversations.map(conversation => {
//                 const otherParticipant = conversation.participants.find(
//                   p => p._id !== '507f1f77bcf86cd799439011'
//                 );
//
//                 return (
//                   <div
//                     key={conversation._id}
//                     onClick={() => setSelectedConversation(conversation)}
//                     className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
//                       selectedConversation?._id === conversation._id ? 'bg-green-50' : ''
//                     }`}
//                   >
//                     <div className="flex items-center gap-3">
//                       <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
//                         <span className="text-green-600 font-semibold">
//                           {otherParticipant?.name?.charAt(0) || 'U'}
//                         </span>
//                       </div>
//                       <div className="flex-1 min-w-0">
//                         <div className="flex justify-between items-center">
//                           <h3 className="font-medium text-gray-900 truncate">
//                             {otherParticipant?.name || 'Unknown User'}
//                           </h3>
//                           <span className="text-xs text-gray-500">
//                             {formatTime(conversation.lastMessage?.timestamp)}
//                           </span>
//                         </div>
//                         <p className="text-sm text-gray-500 truncate">
//                           {conversation.lastMessage?.content || 'No messages yet'}
//                         </p>
//                         <span className="text-xs text-blue-600 capitalize">
//                           {conversation.type.replace('-', ' ')}
//                         </span>
//                       </div>
//                     </div>
//                   </div>
//                 );
//               })}
//
//               {conversations.length === 0 && (
//                 <div className="p-8 text-center">
//                   <div className="text-gray-400 mb-2">No conversations yet</div>
//                   <p className="text-sm text-gray-500">
//                     Start messaging with farmers and buyers
//                   </p>
//                 </div>
//               )}
//             </div>
//           </div>
//
//           {/* Chat Area */}
//           <div className={`${
//             isMobile && !selectedConversation ? 'hidden' : 'flex'
//           } flex-1 flex flex-col`}>
//             {selectedConversation ? (
//               <>
//                 {/* Chat Header */}
//                 <div className="bg-white border-b border-gray-200 p-4">
//                   <div className="flex items-center justify-between">
//                     <div className="flex items-center gap-3">
//                       {isMobile && (
//                         <button
//                           onClick={() => setSelectedConversation(null)}
//                           className="p-2 hover:bg-gray-100 rounded-lg"
//                         >
//                           <ArrowLeft className="w-5 h-5" />
//                         </button>
//                       )}
//                       <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
//                         <span className="text-green-600 font-semibold">
//                           {selectedConversation.participants.find(
//                             p => p._id !== '507f1f77bcf86cd799439011'
//                           )?.name?.charAt(0) || 'U'}
//                         </span>
//                       </div>
//                       <div>
//                         <h2 className="font-semibold text-gray-900">
//                           {selectedConversation.participants.find(
//                             p => p._id !== '507f1f77bcf86cd799439011'
//                           )?.name || 'Unknown User'}
//                         </h2>
//                         <p className="text-sm text-gray-500 capitalize">
//                           {selectedConversation.type.replace('-', ' ')}
//                         </p>
//                       </div>
//                     </div>
//                     <div className="flex items-center gap-2">
//                       <button className="p-2 hover:bg-gray-100 rounded-lg">
//                         <Phone className="w-5 h-5 text-gray-600" />
//                       </button>
//                       <button className="p-2 hover:bg-gray-100 rounded-lg">
//                         <Video className="w-5 h-5 text-gray-600" />
//                       </button>
//                       <button className="p-2 hover:bg-gray-100 rounded-lg">
//                         <MoreVertical className="w-5 h-5 text-gray-600" />
//                       </button>
//                     </div>
//                   </div>
//                 </div>
//
//                 {/* Messages */}
//                 <div className="flex-1 overflow-y-auto p-4 space-y-4">
//                   {messages.map(message => {
//                     const isOwn = message.sender._id === '507f1f77bcf86cd799439011';
//
//                     return (
//                       <div
//                         key={message._id}
//                         className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
//                       >
//                         <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
//                           isOwn
//                             ? 'bg-green-600 text-white'
//                             : 'bg-gray-200 text-gray-900'
//                         }`}>
//                           <p>{message.content}</p>
//                           <p className={`text-xs mt-1 ${
//                             isOwn ? 'text-green-100' : 'text-gray-500'
//                           }`}>
//                             {formatTime(message.createdAt)}
//                           </p>
//                         </div>
//                       </div>
//                     );
//                   })}
//                 </div>
//
//                 {/* Message Input */}
//                 <div className="bg-white border-t border-gray-200 p-4">
//                   <form onSubmit={sendMessage} className="flex gap-2">
//                     <input
//                       type="text"
//                       value={newMessage}
//                       onChange={(e) => setNewMessage(e.target.value)}
//                       placeholder="Type a message..."
//                       className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
//                     />
//                     <button
//                       type="submit"
//                       disabled={!newMessage.trim()}
//                       className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
//                     >
//                       <Send className="w-5 h-5" />
//                     </button>
//                   </form>
//                 </div>
//               </>
//             ) : (
//               <div className="flex-1 flex items-center justify-center bg-gray-50">
//                 <div className="text-center">
//                   <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
//                     <Send className="w-8 h-8 text-gray-400" />
//                   </div>
//                   <h3 className="text-lg font-medium text-gray-900 mb-2">
//                     Select a conversation
//                   </h3>
//                   <p className="text-gray-500">
//                     Choose a conversation to start messaging
//                   </p>
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
