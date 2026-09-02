import React from 'react';
import {
  ShoppingCart, Utensils, Zap, Car, ShoppingBag,
  Tv, HeartPulse, Home, Coins, TrendingUp,
  Coffee, Plane, Film, GraduationCap, Dumbbell,
  Shield, Gift, DollarSign, Briefcase, Wrench,
  Bus, Book, Smartphone, Landmark, PiggyBank,
  CreditCard, Tag, Sparkles, Folder, HelpCircle,
  ArrowLeftRight,
  LucideIcon
} from 'lucide-react';

interface CategoryIconProps {
  name: string;
  iconName?: string;
  className?: string;
  color?: string;
  size?: number;
}

const ICON_MAP: Record<string, LucideIcon> = {
  ShoppingCart,
  Utensils,
  Zap,
  Car,
  ShoppingBag,
  Tv,
  HeartPulse,
  Home,
  Coins,
  TrendingUp,
  Coffee,
  Plane,
  Film,
  GraduationCap,
  Dumbbell,
  Shield,
  Gift,
  DollarSign,
  Briefcase,
  Wrench,
  Bus,
  Book,
  Smartphone,
  Landmark,
  PiggyBank,
  CreditCard,
  Tag,
  Sparkles,
  Folder,
  ArrowLeftRight,
  HelpCircle,
};

export const AVAILABLE_CATEGORY_ICONS = [
  { name: 'ShoppingCart', label: 'Shopping Cart', icon: ShoppingCart },
  { name: 'Utensils', label: 'Dining & Food', icon: Utensils },
  { name: 'Coffee', label: 'Coffee & Drinks', icon: Coffee },
  { name: 'Zap', label: 'Bills & Utilities', icon: Zap },
  { name: 'Car', label: 'Car & Gas', icon: Car },
  { name: 'Bus', label: 'Public Transit', icon: Bus },
  { name: 'Plane', label: 'Travel & Flights', icon: Plane },
  { name: 'ShoppingBag', label: 'Retail & Clothing', icon: ShoppingBag },
  { name: 'Tv', label: 'Entertainment & Subscriptions', icon: Tv },
  { name: 'Film', label: 'Movies & Streaming', icon: Film },
  { name: 'HeartPulse', label: 'Health & Medical', icon: HeartPulse },
  { name: 'Dumbbell', label: 'Fitness & Gym', icon: Dumbbell },
  { name: 'Home', label: 'Housing & Rent', icon: Home },
  { name: 'GraduationCap', label: 'Education', icon: GraduationCap },
  { name: 'Briefcase', label: 'Work & Salary', icon: Briefcase },
  { name: 'DollarSign', label: 'Income & Money', icon: DollarSign },
  { name: 'TrendingUp', label: 'Investments', icon: TrendingUp },
  { name: 'Coins', label: 'Crypto & Assets', icon: Coins },
  { name: 'ArrowLeftRight', label: 'Transfers & Sweeps', icon: ArrowLeftRight },
  { name: 'Smartphone', label: 'Tech & Gadgets', icon: Smartphone },
  { name: 'Shield', label: 'Insurance', icon: Shield },
  { name: 'Gift', label: 'Gifts & Donations', icon: Gift },
  { name: 'Wrench', label: 'Maintenance & Repairs', icon: Wrench },
  { name: 'Book', label: 'Books & Courses', icon: Book },
];

export function getSuggestedCategoryIcon(categoryName: string): string {
  const name = (categoryName || '').toLowerCase().trim();

  if (name.includes('transfer') || name.includes('sweep') || name.includes('resgate') || name.includes('poupanca') || name.includes('rende')) return 'ArrowLeftRight';
  if (name.includes('grocery') || name.includes('market') || name.includes('supermarket') || name.includes('food')) return 'ShoppingCart';
  if (name.includes('restaurant') || name.includes('dine') || name.includes('dining') || name.includes('eating') || name.includes('cafe')) return 'Utensils';
  if (name.includes('coffee') || name.includes('starbucks')) return 'Coffee';
  if (name.includes('bill') || name.includes('utility') || name.includes('electric') || name.includes('power') || name.includes('water') || name.includes('gas')) return 'Zap';
  if (name.includes('transport') || name.includes('uber') || name.includes('car') || name.includes('fuel') || name.includes('vehicle')) return 'Car';
  if (name.includes('flight') || name.includes('travel') || name.includes('hotel') || name.includes('vacation') || name.includes('airline')) return 'Plane';
  if (name.includes('shop') || name.includes('store') || name.includes('amazon') || name.includes('apparel') || name.includes('clothing')) return 'ShoppingBag';
  if (name.includes('subscription') || name.includes('media') || name.includes('streaming') || name.includes('netflix') || name.includes('spotify')) return 'Tv';
  if (name.includes('movie') || name.includes('cinema') || name.includes('theater')) return 'Film';
  if (name.includes('health') || name.includes('medical') || name.includes('doctor') || name.includes('pharmacy') || name.includes('drug')) return 'HeartPulse';
  if (name.includes('gym') || name.includes('fitness') || name.includes('workout') || name.includes('sport')) return 'Dumbbell';
  if (name.includes('house') || name.includes('rent') || name.includes('mortgage') || name.includes('apartment') || name.includes('home')) return 'Home';
  if (name.includes('education') || name.includes('school') || name.includes('tuition') || name.includes('course') || name.includes('college')) return 'GraduationCap';
  if (name.includes('salary') || name.includes('income') || name.includes('wage') || name.includes('paycheck') || name.includes('job')) return 'Briefcase';
  if (name.includes('invest') || name.includes('stock') || name.includes('dividend') || name.includes('crypto')) return 'TrendingUp';
  if (name.includes('insurance') || name.includes('security')) return 'Shield';
  if (name.includes('gift') || name.includes('donation') || name.includes('charity')) return 'Gift';
  if (name.includes('phone') || name.includes('mobile') || name.includes('internet') || name.includes('tech')) return 'Smartphone';
  if (name.includes('repair') || name.includes('tool') || name.includes('maint')) return 'Wrench';

  return 'Tag';
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  name,
  iconName,
  className = 'w-4 h-4',
  color,
  size,
}) => {
  const chosenIconName = iconName || getSuggestedCategoryIcon(name);
  const IconComponent = ICON_MAP[chosenIconName] || Tag;

  return <IconComponent className={className} style={color ? { color } : undefined} size={size} />;
};
