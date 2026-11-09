import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ElementRef,
  ViewChild,
  AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Channel } from 'pusher-js';
import { PusherService } from '../services/pusher.service';
import { enviroment } from '../../enviroments/enviroments.development';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export interface ChatHistoryItem {
  role: 'user' | 'model';
  content: string;
}

export interface ChatApiRequest {
  conversationId: string;
  message: string;
  history?: ChatHistoryItem[];
}

export interface ChatApiResponse {
  conversationId: string;
  reply: string;
  pusherChannel: string;
  pusherEvent: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  private readonly http = inject(HttpClient);
  private readonly pusherService = inject(PusherService);

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  // Estado del chat
  isOpen = signal<boolean>(false);
  isTyping = signal<boolean>(false);
  hasUnread = signal<boolean>(false);
  newMessage = signal<string>('');
  messages = signal<ChatMessage[]>([]);

  conversationId = '';
  private channel?: Channel;
  private shouldScrollBottom = false;

  readonly quickSuggestions: string[] = [
    '🍗 ¿Qué platos tienen en oferta hoy?',
    '🍟 ¿Los combos vienen con papas y ensalada?',
    '🛵 ¿Cómo funciona el delivery y cuánto demora?',
    '🕒 ¿Cuál es el horario de atención?',
    '📦 ¿Cómo puedo rastrear mi pedido?'
  ];

  ngOnInit(): void {
    this.initConversation();
    this.setupPusher();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.cleanupPusher();
  }

  // Alternar apertura y cierre del chatbot
  toggleChat(open?: boolean): void {
    const nextState = open !== undefined ? open : !this.isOpen();
    this.isOpen.set(nextState);

    if (nextState) {
      this.hasUnread.set(false);
      this.shouldScrollBottom = true;
    }
  }

  // Inicializar o recuperar conversationId (debe ser un UUID válido no vacío)
  private initConversation(): void {
    const storedConvId = this.getFromStorage('polleria_chat_conv_id');
    if (storedConvId && this.isValidUUID(storedConvId)) {
      this.conversationId = storedConvId;
    } else {
      this.conversationId = this.generateUUID();
      this.saveToStorage('polleria_chat_conv_id', this.conversationId);
    }

    // Cargar historial previo de almacenamiento local si existe
    const storedHistory = this.getFromStorage('polleria_chat_history');
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const loaded: ChatMessage[] = parsed.map((m: any) => ({
            id: m.id || this.generateUUID(),
            role: m.role === 'user' ? 'user' : 'model',
            content: m.content,
            timestamp: new Date(m.timestamp)
          }));
          this.messages.set(loaded);
          this.shouldScrollBottom = true;
          return;
        }
      } catch (e) {
        console.warn('Error leyendo historial guardado de chat:', e);
      }
    }

    // Mensaje de bienvenida inicial (se muestra en UI pero no se envía en history)
    this.messages.set([
      {
        id: 'welcome-0',
        role: 'model',
        content: '¡Hola! 🍗 Bienvenido a **Pollería El Gigante**. Soy tu asistente virtual. ¿En qué te puedo ayudar hoy? Pregúntame sobre nuestras ofertas, combos, delivery o estado de tu pedido.',
        timestamp: new Date()
      }
    ]);
  }

  // Configuración de Pusher:
  // Canal: chat-{conversationId sin guiones}
  // Evento: assistant-message
  private setupPusher(): void {
    try {
      const cleanId = this.conversationId.replace(/-/g, '');
      const channelName = `chat-${cleanId}`;

      this.channel = this.pusherService.subscribeToChannel(
        channelName,
        'assistant-message',
        (data: any) => {
          this.handleIncomingMessage(data, 'pusher');
        }
      );
    } catch (err) {
      console.warn('Error suscribiendo al canal de Pusher:', err);
    }
  }

  private cleanupPusher(): void {
    if (this.conversationId) {
      const cleanId = this.conversationId.replace(/-/g, '');
      const channelName = `chat-${cleanId}`;
      if (this.channel) {
        this.channel.unbind('assistant-message');
      }
      this.pusherService.unsubscribe(channelName);
    }
  }

  // Reiniciar la conversación con un nuevo UUID válido
  resetConversation(): void {
    this.cleanupPusher();

    this.conversationId = this.generateUUID();
    this.saveToStorage('polleria_chat_conv_id', this.conversationId);
    this.removeFromStorage('polleria_chat_history');

    this.messages.set([
      {
        id: 'welcome-' + Date.now(),
        role: 'model',
        content: '¡Conversación reiniciada! 🍗 ¿Qué deseas consultar hoy?',
        timestamp: new Date()
      }
    ]);

    this.isTyping.set(false);
    this.setupPusher();
    this.shouldScrollBottom = true;
  }

  // Enviar mensaje al endpoint POST /api/chat/messages
  sendMessage(customText?: string): void {
    const text = (customText ?? this.newMessage()).trim();
    if (!text || this.isTyping()) return;

    // 1. Construir el arreglo `history` ANTES de agregar el nuevo mensaje
    // Reglas:
    // - Máximo 10 elementos (.slice(-10))
    // - Solo role "user" o "model"
    // - Excluir mensajes de bienvenida estáticos y errores
    // - Longitud de content entre 1 y 1000 caracteres
    const historyToSend: ChatHistoryItem[] = this.messages()
      .filter(m => !m.id.startsWith('welcome-') && !m.id.startsWith('err_'))
      .map(m => ({
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        content: m.content.trim().substring(0, 1000)
      }))
      .filter(item => item.content.length > 0)
      .slice(-10); // Máximo 10 elementos según contrato

    // 2. Agregar mensaje del usuario en la interfaz
    const userMsg: ChatMessage = {
      id: 'usr_' + Date.now(),
      role: 'user',
      content: text.substring(0, 1000),
      timestamp: new Date()
    };

    this.messages.update(list => [...list, userMsg]);
    this.newMessage.set('');
    this.isTyping.set(true);
    this.shouldScrollBottom = true;
    this.saveHistory();

    // 3. Preparar payload para POST /api/chat/messages
    const body: ChatApiRequest = {
      conversationId: this.conversationId,
      message: text.substring(0, 1000),
      history: historyToSend
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const apiUrl = enviroment.backenbaseurl
      ? `${enviroment.backenbaseurl}/api/chat/messages`
      : '/api/chat/messages';

    // 4. Realizar la solicitud HTTP
    this.http.post<ChatApiResponse>(apiUrl, body, { headers }).subscribe({
      next: (response) => {
        // La respuesta contiene { conversationId, reply, pusherChannel, pusherEvent }
        this.handleIncomingMessage(response, 'http');
      },
      error: (err) => {
        console.error('Error al enviar mensaje a /api/chat/messages:', err);

        // Si Pusher responde en paralelo por websocket, esperamos un breve intervalo
        setTimeout(() => {
          if (this.isTyping()) {
            this.isTyping.set(false);
            const errorMsg: ChatMessage = {
              id: 'err_' + Date.now(),
              role: 'model',
              content: 'Lo siento, no pude conectar con el servidor en este momento. Por favor verifica tu conexión o intenta nuevamente.',
              timestamp: new Date()
            };
            this.messages.update(list => [...list, errorMsg]);
            this.shouldScrollBottom = true;
            this.saveHistory();
          }
        }, 3000);
      }
    });
  }

  // Procesar y deduplicar respuestas (llegadas vía HTTP o vía Pusher)
  private handleIncomingMessage(data: any, source: 'http' | 'pusher'): void {
    if (!data) return;

    const replyText = this.extractMessageText(data);
    if (!replyText || !replyText.trim()) return;

    const cleanReply = replyText.trim();
    const currentList = this.messages();

    // Deduplicación: Si el último mensaje del modelo ya tiene exactamente el mismo contenido,
    // significa que ya lo procesó la otra vía (HTTP o Pusher)
    const recentModelMsgs = currentList.slice(-2).filter(m => m.role === 'model');
    if (recentModelMsgs.some(m => m.content.trim() === cleanReply)) {
      this.isTyping.set(false);
      return;
    }

    const modelMsg: ChatMessage = {
      id: `mod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      role: 'model',
      content: cleanReply,
      timestamp: new Date()
    };

    this.messages.update(list => [...list, modelMsg]);
    this.isTyping.set(false);
    this.shouldScrollBottom = true;
    this.saveHistory();

    // Notificación en el botón si el chat estaba cerrado
    if (!this.isOpen()) {
      this.hasUnread.set(true);
    }
  }

  // Extraer texto compatible con la respuesta { reply: "..." } del API o Pusher
  private extractMessageText(data: any): string {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (typeof data.reply === 'string') return data.reply;
    if (typeof data.message === 'string') return data.message;
    if (typeof data.content === 'string') return data.content;
    if (typeof data.response === 'string') return data.response;
    if (typeof data.text === 'string') return data.text;
    if (data.data) return this.extractMessageText(data.data);
    return '';
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      try {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      } catch (err) {
        // ignorar
      }
    }
  }

  private saveHistory(): void {
    try {
      this.saveToStorage('polleria_chat_history', JSON.stringify(this.messages()));
    } catch (e) {
      console.warn('No se pudo guardar el historial:', e);
    }
  }

  // Validación estricta de UUID v4 no nulo
  private isValidUUID(uuid: string | null): boolean {
    if (!uuid) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid) && uuid !== '00000000-0000-0000-0000-000000000000';
  }

  private generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private getFromStorage(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
    return null;
  }

  private saveToStorage(key: string, value: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
    }
  }

  private removeFromStorage(key: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(key);
    }
  }

  formatTime(date: Date): string {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}