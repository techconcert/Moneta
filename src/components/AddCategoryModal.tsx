import React, { useState, useEffect } from 'react';
import { Category, CategoryType } from '../types';
import { CategoryIcon, AVAILABLE_CATEGORY_ICONS, getSuggestedCategoryIcon } from './CategoryIcon';
import { X, Sparkles, Check, Plus, Edit3 } from 'lucide-react';

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCategory: (category: Category, oldName?: string) => void;
  editingCategory?: Category | null;
  initialName?: string;
  initialType?: CategoryType;
}

const PRESET_COLORS = [
  '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#EF4444', '#14B8A6', '#6366F1', '#0EA5E9', '#22C55E',
  '#64748B', '#D97706', '#9333EA', '#0284C7', '#475569'
];

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  isOpen,
  onClose,
  onSaveCategory,
  editingCategory,
  initialName = '',
  initialType = 'expense',
}) => {
  const [catName, setCatName] = useState(initialName);
  const [catType, setCatType] = useState<CategoryType>(initialType);
  const [catIcon, setCatIcon] = useState('Tag');
  const [catColor, setCatColor] = useState('#10B981');

  useEffect(() => {
    if (!isOpen) return;

    if (editingCategory) {
      setCatName(editingCategory.name);
      setCatType(editingCategory.type);
      setCatIcon(editingCategory.icon || 'Tag');
      setCatColor(editingCategory.color || '#10B981');
    } else {
      setCatName(initialName);
      setCatType(initialType);
      setCatIcon(initialName ? getSuggestedCategoryIcon(initialName) : 'Tag');
      setCatColor('#10B981');
    }
  }, [isOpen, editingCategory, initialName, initialType]);

  useEffect(() => {
    if (!editingCategory && catName.trim()) {
      const suggested = getSuggestedCategoryIcon(catName);
      setCatIcon(suggested);
    }
  }, [catName, editingCategory]);

  const suggestedIcon = catName.trim() ? getSuggestedCategoryIcon(catName) : 'Tag';

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const categoryToSave: Category = {
      id: editingCategory ? editingCategory.id : `cat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: catName.trim(),
      icon: catIcon,
      color: catColor,
      type: catType,
      isAiGenerated: editingCategory ? editingCategory.isAiGenerated : false,
    };

    onSaveCategory(categoryToSave, editingCategory ? editingCategory.name : undefined);
    setCatName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              {editingCategory ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {editingCategory ? 'Edit Category' : 'Create New Category'}
              </h3>
              <p className="text-[11px] text-slate-500">Define name, icon, color, and transaction flow type</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Category Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Pet Care, Electronics, Auto Savings"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Category Type</label>
            <select
              value={catType}
              onChange={(e) => setCatType(e.target.value as CategoryType)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-xs"
            >
              <option value="expense">Expense (- Outflow)</option>
              <option value="income">Income (+ Inflow)</option>
              <option value="transfer">Internal Transfer / Sweep (Neutral Balance)</option>
            </select>
          </div>

          {/* Icon Selector with AI suggestion badge */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-semibold text-slate-700">Category Icon</label>
              <button
                type="button"
                onClick={() => setCatIcon(suggestedIcon)}
                className={`text-[10px] px-2.5 py-1 rounded-md font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                  catIcon === suggestedIcon
                    ? 'text-purple-700 bg-purple-100 border border-purple-200'
                    : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 hover:border-purple-300'
                }`}
                title={`Click to apply AI suggested icon (${suggestedIcon})`}
              >
                <Sparkles className="w-3 h-3 text-purple-500 animate-pulse" />
                <span>
                  Suggested: <strong>{suggestedIcon}</strong> {catIcon === suggestedIcon ? '✓ (Applied)' : '(Click to apply)'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
              {AVAILABLE_CATEGORY_ICONS.map((item) => {
                const IconComp = item.icon;
                const isSelected = catIcon === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setCatIcon(item.name)}
                    className={`p-2 rounded-lg flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                    title={item.label}
                  >
                    <IconComp className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Swatch Picker */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Accent Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCatColor(color)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    catColor === color ? 'ring-2 ring-slate-900 ring-offset-2 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {catColor === color && <Check className="w-3 h-3 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center space-x-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold shadow-sm shrink-0"
              style={{ backgroundColor: catColor }}
            >
              <CategoryIcon name={catName || 'Preview'} iconName={catIcon} className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-xs block">{catName || 'Category Name'}</span>
              <span className="text-[10px] text-slate-500 capitalize">{catType} • Icon: {catIcon}</span>
            </div>
          </div>

          <div className="pt-3 flex justify-end space-x-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-md"
            >
              Save Category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
